import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JsonSchema } from "../../src/lib/abilities.ts";
import {
	type Field,
	fieldErrors,
	initialInput,
	itemField,
	readAt,
	toForm,
	writeAt,
} from "../../src/lib/schema-form.ts";

// What all three of core's abilities ship on WP 7.1.
const CORE_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		fields: {
			type: "array",
			items: { type: "string", enum: ["name", "url", "language"] },
			description: "Optional: Limit response to specific fields.",
		},
	},
	additionalProperties: false,
	default: {},
};

const field = (form: { fields: Field[] }, key: string) => {
	const found = form.fields.find((candidate) => candidate.key === key);
	assert.ok(found, `no field keyed ${key}`);
	return found;
};

describe("toForm", () => {
	it("asks for nothing when the ability takes no input", () => {
		assert.deepEqual(toForm({}), { fields: [], unsupported: null });
		assert.deepEqual(toForm(undefined), { fields: [], unsupported: null });
	});

	it("turns core's array of allowed values into one set of checkboxes", () => {
		const form = toForm(CORE_SCHEMA);
		const fields = field(form, "fields");

		assert.equal(form.unsupported, null);
		assert.equal(fields.control, "checkboxes");
		assert.equal(fields.label, "Fields");
		assert.equal(fields.required, false);
		assert.ok(fields.control === "checkboxes");
		assert.deepEqual(
			fields.options.map(({ value }) => value),
			["name", "url", "language"],
		);
	});

	it("picks a control per property type", () => {
		const form = toForm({
			type: "object",
			properties: {
				post_title: { type: "string", maxLength: 60 },
				count: { type: "integer", minimum: 1 },
				ratio: { type: "number" },
				sticky: { type: "boolean" },
				status: { type: "string", enum: ["draft", "publish"] },
				owner: { type: "string", format: "email" },
				tags: { type: "array", items: { type: "string" } },
			},
			required: ["post_title", "status"],
		});

		assert.equal(field(form, "post_title").control, "text");
		assert.equal(field(form, "count").control, "number");
		assert.equal(field(form, "ratio").control, "number");
		assert.equal(field(form, "sticky").control, "toggle");
		assert.equal(field(form, "status").control, "select");
		assert.equal(field(form, "tags").control, "list");

		const title = field(form, "post_title");
		assert.equal(title.label, "Post title");
		assert.equal(title.required, true);
		assert.ok(title.control === "text");
		assert.equal(title.maxLength, 60);

		const count = field(form, "count");
		assert.ok(count.control === "number");
		assert.equal(count.integer, true);
		assert.equal(count.minimum, 1);

		const ratio = field(form, "ratio");
		assert.ok(ratio.control === "number");
		assert.equal(ratio.integer, false);

		const owner = field(form, "owner");
		assert.ok(owner.control === "text");
		assert.equal(owner.inputType, "email");

		assert.equal(field(form, "sticky").required, false);
	});

	it("nests an object into a group whose children carry the full path", () => {
		const form = toForm({
			type: "object",
			properties: {
				author: {
					type: "object",
					title: "Author",
					properties: {
						name: { type: "string" },
						id: { type: "integer" },
					},
					required: ["name"],
				},
			},
		});

		const author = field(form, "author");
		assert.equal(author.control, "group");
		assert.equal(author.label, "Author");
		assert.ok(author.control === "group");
		assert.deepEqual(
			author.fields.map(({ key, path, required }) => [key, path, required]),
			[
				["author.name", ["author", "name"], true],
				["author.id", ["author", "id"], false],
			],
		);
	});

	it("makes a scalar schema the whole input", () => {
		const form = toForm({ type: "string", minLength: 3 }, "Search term");
		const [only] = form.fields;

		assert.equal(form.fields.length, 1);
		assert.deepEqual(only.path, []);
		assert.equal(only.label, "Search term");
		// Nothing else can carry the value, so it cannot be left out.
		assert.equal(only.required, true);
	});

	it("does not require a scalar input the schema defaults", () => {
		assert.equal(
			toForm({ type: "string", default: "" }).fields[0].required,
			false,
		);
		assert.equal(
			toForm({ type: ["string", "null"] }).fields[0].required,
			false,
		);
	});
});

describe("toForm, shapes no form can show", () => {
	it("refuses a schema built from alternatives", () => {
		assert.equal(
			toForm({ oneOf: [{ type: "string" }, { type: "number" }] }).unsupported,
			"alternatives",
		);
		assert.equal(
			toForm({ $ref: "#/definitions/post" }).unsupported,
			"alternatives",
		);
	});

	it("refuses an object that names no properties", () => {
		assert.equal(toForm({ type: "object" }).unsupported, "freeform");
		assert.equal(
			toForm({ type: "object", additionalProperties: true }).unsupported,
			"freeform",
		);
	});

	it("disables the one field it cannot show and keeps the rest", () => {
		const form = toForm({
			type: "object",
			properties: {
				title: { type: "string" },
				either: { anyOf: [{ type: "string" }, { type: "integer" }] },
				pair: {
					type: "array",
					items: [{ type: "string" }, { type: "integer" }],
				},
				anything: {},
				both: { type: ["string", "integer"] },
			},
		});

		assert.equal(form.unsupported, null);
		assert.equal(field(form, "title").control, "text");
		for (const [key, reason] of [
			["either", "alternatives"],
			["pair", "tuple"],
			["anything", "untyped"],
			["both", "mixed-types"],
		]) {
			const found = field(form, key);
			assert.ok(found.control === "unsupported");
			assert.equal(found.reason, reason);
		}
	});
});

describe("initialInput", () => {
	it("starts from the schema's own defaults", () => {
		assert.deepEqual(initialInput(toForm(CORE_SCHEMA)), {});
		assert.deepEqual(
			initialInput(
				toForm({
					type: "object",
					properties: {
						status: { type: "string", enum: ["draft"], default: "draft" },
						sticky: { type: "boolean" },
					},
				}),
			),
			{ status: "draft" },
		);
	});

	it("has nothing to fill in when no default is declared", () => {
		assert.equal(initialInput(toForm({ type: "string" })), undefined);
	});
});

describe("readAt and writeAt", () => {
	it("writes a nested value without touching its siblings", () => {
		const input = { author: { name: "Ann", id: 3 } };
		const next = writeAt(input, ["author", "name"], "Bo");

		assert.deepEqual(next, { author: { name: "Bo", id: 3 } });
		assert.deepEqual(input, { author: { name: "Ann", id: 3 } });
	});

	it("builds a list where the path holds an index", () => {
		assert.deepEqual(writeAt(undefined, ["tags", "0"], "a"), { tags: ["a"] });
		assert.deepEqual(writeAt({ tags: ["a"] }, ["tags", "1"], "b"), {
			tags: ["a", "b"],
		});
	});

	it("leaves no hole when the index is past the end of the list", () => {
		assert.deepEqual(writeAt(undefined, ["tags", "4"], "b"), { tags: ["b"] });
	});

	it("replaces the whole input for the empty path", () => {
		assert.equal(writeAt({ a: 1 }, [], "scalar"), "scalar");
		assert.equal(readAt("scalar", []), "scalar");
	});

	it("reads nothing through a value that is not an object", () => {
		assert.equal(readAt({ a: 1 }, ["a", "b"]), undefined);
	});
});

describe("itemField", () => {
	it("numbers a row and everything under it", () => {
		const form = toForm({
			type: "object",
			properties: {
				authors: {
					type: "array",
					items: {
						type: "object",
						properties: { name: { type: "string" } },
					},
				},
			},
		});

		const list = field(form, "authors");
		assert.ok(list.control === "list");
		const row = itemField(list.item, 2);

		assert.deepEqual(row.path, ["authors", "2"]);
		assert.equal(row.key, "authors.2");
		assert.ok(row.control === "group");
		assert.deepEqual(row.fields[0].path, ["authors", "2", "name"]);
	});

	it("leaves an inner list its own row number", () => {
		const form = toForm({
			type: "object",
			properties: {
				rows: {
					type: "array",
					items: { type: "array", items: { type: "string" } },
				},
			},
		});

		const outer = field(form, "rows");
		assert.ok(outer.control === "list");
		const row = itemField(outer.item, 0);
		assert.ok(row.control === "list");

		assert.deepEqual(itemField(row.item, 4).path, ["rows", "0", "4"]);
	});
});

describe("fieldErrors", () => {
	const form = toForm({
		type: "object",
		properties: {
			title: { type: "string", minLength: 3, maxLength: 5 },
			slug: { type: "string", pattern: "^[a-z]+$" },
			broken: { type: "string", pattern: "^([a-z" },
			count: { type: "integer", minimum: 1, maximum: 10 },
			over: { type: "number", maximum: 10, exclusiveMaximum: true },
			picks: {
				type: "array",
				items: { type: "string", enum: ["a", "b"] },
				minItems: 2,
			},
		},
		required: ["title", "picks"],
	});

	const codes = (input: unknown) =>
		Object.fromEntries(
			Object.entries(fieldErrors(form, input)).map(([key, error]) => [
				key,
				error.code,
			]),
		);

	it("reports only what the schema requires when nothing is filled in", () => {
		assert.deepEqual(codes({}), { title: "required", picks: "required" });
	});

	it("reports every rule the value breaks", () => {
		assert.deepEqual(
			codes({
				title: "ab",
				slug: "Nope",
				count: 1.5,
				over: 10,
				picks: ["a"],
			}),
			{
				title: "min-length",
				slug: "pattern",
				count: "not-an-integer",
				over: "maximum",
				picks: "min-items",
			},
		);
	});

	it("keeps a filled-in valid form clean", () => {
		assert.deepEqual(
			codes({
				title: "abcd",
				slug: "ok",
				count: 10,
				over: 9,
				picks: ["a", "b"],
			}),
			{},
		);
	});

	it("carries the limit a message has to print", () => {
		assert.deepEqual(
			fieldErrors(form, { title: "abcdef", picks: ["a", "b"] }),
			{
				title: { code: "max-length", limit: 5 },
			},
		);
		assert.deepEqual(
			fieldErrors(form, { title: "abc", picks: ["a", "b"], count: 0 }),
			{
				count: { code: "minimum", limit: 1, exclusive: false },
			},
		);
	});

	it("does not fail a value against a pattern that will not compile", () => {
		assert.deepEqual(
			codes({ title: "abc", picks: ["a", "b"], broken: "x" }),
			{},
		);
	});

	it("checks each row of a list on its own", () => {
		const rows = toForm({
			type: "object",
			properties: {
				tags: { type: "array", items: { type: "string", minLength: 2 } },
			},
		});

		assert.deepEqual(fieldErrors(rows, { tags: ["ok", "x"] }), {
			"tags.1": { code: "min-length", limit: 2 },
		});
	});

	it("asks nothing of a field it cannot show", () => {
		const unshowable = toForm({
			type: "object",
			properties: { either: { anyOf: [{ type: "string" }] } },
			required: ["either"],
		});

		assert.deepEqual(fieldErrors(unshowable, {}), {});
	});
});
