import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { JsonSchema } from "../../src/lib/abilities.ts";
import {
	activeForm,
	branchFor,
	type Field,
	fieldErrors,
	hasErrorIn,
	initialInput,
	itemField,
	readAt,
	splitFields,
	switchBranch,
	toForm,
	withDiscriminator,
	writeAt,
} from "../../src/lib/schema-form.ts";

// WooCommerce 11.0.1's own, read off the REST listing rather than rewritten.
const WOO: Record<string, JsonSchema> = JSON.parse(
	readFileSync(
		new URL("./fixtures/woocommerce-schemas.json", import.meta.url),
		"utf8",
	),
);

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

const UNION: JsonSchema = {
	type: "object",
	oneOf: [
		{
			type: "object",
			properties: {
				kind: { type: "string", enum: ["letter"] },
				subject: { type: "string" },
				pages: { type: "integer" },
			},
			required: ["kind", "subject"],
		},
		{
			type: "object",
			properties: {
				kind: { type: "string", enum: ["parcel"] },
				subject: { type: "string" },
				weight: { type: "number" },
			},
			required: ["kind", "weight"],
		},
	],
};

describe("toForm on a union", () => {
	it("finds the property the arms disagree on", () => {
		const form = toForm(UNION);

		assert.equal(form.unsupported, null);
		assert.equal(form.union?.discriminator, "kind");
		assert.deepEqual(
			form.union?.branches.map(({ name }) => name),
			["letter", "parcel"],
		);
	});

	// Picking the arm already says which it is, so the arm must not ask again.
	it("leaves the discriminator out of the arm's own fields", () => {
		const form = toForm(UNION);
		const letter = activeForm(form, "0");

		assert.deepEqual(
			letter.fields.map(({ key }) => key),
			["subject", "pages"],
		);
		assert.equal(
			letter.fields.find(({ key }) => key === "subject")?.required,
			true,
		);
	});

	it("puts no fields at the top level", () => {
		assert.deepEqual(toForm(UNION).fields, []);
	});

	it("falls back to the first arm for a key that is not there", () => {
		const form = toForm(UNION);

		assert.equal(branchFor(form, null)?.name, "letter");
		assert.equal(branchFor(form, "nope")?.name, "letter");
	});

	it("prefers a title the schema supplies over the pinned value", () => {
		const titled: JsonSchema = {
			oneOf: [
				{
					type: "object",
					title: "A letter",
					properties: { kind: { type: "string", enum: ["letter"] } },
				},
				{
					type: "object",
					properties: { kind: { type: "string", enum: ["parcel"] } },
				},
			],
		};

		assert.deepEqual(
			toForm(titled).union?.branches.map(({ name }) => name),
			["A letter", "parcel"],
		);
	});

	it("names nothing when no property is pinned twice", () => {
		const loose: JsonSchema = {
			oneOf: [
				{ type: "object", properties: { a: { type: "string" } } },
				{ type: "object", properties: { b: { type: "string" } } },
			],
		};
		const form = toForm(loose);

		assert.equal(form.union?.discriminator, null);
		assert.deepEqual(
			form.union?.branches.map(({ name }) => name),
			[null, null],
		);
	});

	it("still refuses alternation it cannot render", () => {
		assert.equal(
			toForm({ anyOf: [{ type: "string" }] }).unsupported,
			"alternatives",
		);
		assert.equal(
			toForm({ allOf: [{ type: "object" }] }).unsupported,
			"alternatives",
		);
		// One arm is not a choice, and an arm that declares no object is not one.
		assert.equal(
			toForm({ oneOf: [{ type: "object", properties: {} }] }).unsupported,
			"alternatives",
		);
		assert.equal(
			toForm({
				oneOf: [{ properties: { a: {} } }, { properties: { b: {} } }],
			}).unsupported,
			"alternatives",
		);
		assert.equal(
			toForm({ oneOf: [{ type: "string" }, { type: "number" }] }).unsupported,
			"alternatives",
		);
	});

	it("refuses alternation inside an arm rather than at the top", () => {
		const nested: JsonSchema = {
			oneOf: [
				{
					type: "object",
					properties: {
						kind: { type: "string", enum: ["one"] },
						odd: { oneOf: [{ type: "string" }] },
					},
				},
				{
					type: "object",
					properties: { kind: { type: "string", enum: ["two"] } },
				},
			],
		};
		const form = toForm(nested);

		assert.equal(form.unsupported, null);
		const odd = activeForm(form, "0").fields.find(({ key }) => key === "odd");
		assert.equal(odd?.control, "unsupported");
		assert.equal(
			odd?.control === "unsupported" ? odd.reason : null,
			"alternatives",
		);
	});
});

describe("switchBranch", () => {
	const form = toForm(UNION);

	it("writes the arm's own value into the discriminator", () => {
		const input = switchBranch(form, "0", "1", {});

		assert.equal(readAt(input, ["kind"]), "parcel");
	});

	it("carries a value whose field survives the switch", () => {
		const input = switchBranch(form, "0", "1", {
			kind: "letter",
			subject: "keep me",
			pages: "3",
		});

		assert.equal(readAt(input, ["subject"]), "keep me");
	});

	it("drops a value the arm being entered has no field for", () => {
		const input = switchBranch(form, "0", "1", {
			subject: "keep me",
			pages: "3",
		});

		assert.equal(readAt(input, ["pages"]), undefined);
	});

	// Two arms can name the same property as different kinds of value.
	it("drops a value whose field changed control", () => {
		const retyped: JsonSchema = {
			oneOf: [
				{
					type: "object",
					properties: {
						kind: { type: "string", enum: ["a"] },
						size: { type: "string" },
					},
				},
				{
					type: "object",
					properties: {
						kind: { type: "string", enum: ["b"] },
						size: { type: "boolean" },
					},
				},
			],
		};
		const input = switchBranch(toForm(retyped), "0", "1", { size: "large" });

		assert.equal(readAt(input, ["size"]), undefined);
	});
});

describe("toForm on WooCommerce's own unions", () => {
	it("renders product-create as five named arms", () => {
		const form = toForm(WOO["product-create"]);

		assert.equal(form.unsupported, null);
		assert.equal(form.union?.discriminator, "product_type_alias");
		assert.deepEqual(
			form.union?.branches.map(({ name }) => name),
			["physical", "virtual", "digital", "affiliate", "grouped"],
		);
	});

	it("gives every product-create arm a form with fields", () => {
		for (const branch of toForm(WOO["product-create"]).union?.branches ?? []) {
			assert.equal(branch.form.unsupported, null, branch.name ?? "?");
			assert.ok(branch.form.fields.length, branch.name ?? "?");
			// The Select carries it, so no arm asks for the type again.
			assert.equal(
				branch.form.fields.some(({ key }) => key === "product_type_alias"),
				false,
			);
		}
	});

	it("leaves product-update's unpinned first arm unnamed", () => {
		const form = toForm(WOO["product-update"]);

		assert.equal(form.union?.discriminator, "product_type_alias");
		assert.deepEqual(
			form.union?.branches.map(({ name }) => name),
			[null, "physical", "virtual", "digital", "affiliate", "grouped"],
		);
		// Nothing pinned means nothing to write when that arm is chosen.
		assert.equal(form.union?.branches[0].value, undefined);
	});

	it("keeps each arm's own required fields", () => {
		const form = toForm(WOO["product-create"]);
		const physical = activeForm(form, "0");

		assert.deepEqual(fieldErrors(physical, initialInput(physical)), {
			name: { code: "required" },
		});
	});
});

describe("withDiscriminator", () => {
	const form = toForm(UNION);

	// coerceInput rebuilds from the arm's fields, which this is not one of.
	it("puts the arm's value back onto a payload built without it", () => {
		const sent = withDiscriminator(form, "1", { name: "Ada" });

		assert.deepEqual(sent, { name: "Ada", kind: "parcel" });
	});

	it("leaves a payload alone when the arm pins nothing", () => {
		const unpinned = toForm(WOO["product-update"]);

		assert.deepEqual(withDiscriminator(unpinned, "0", { id: 7 }), { id: 7 });
	});

	it("leaves a payload alone when there is no union", () => {
		const plain = toForm({
			type: "object",
			properties: { a: { type: "string" } },
		});

		assert.deepEqual(withDiscriminator(plain, null, { a: "x" }), { a: "x" });
	});
});

describe("splitFields", () => {
	it("shows what is required and keeps the rest behind the disclosure", () => {
		const form = toForm({
			type: "object",
			properties: {
				search: { type: "string" },
				replace: { type: "string" },
				dry_run: { type: "boolean", default: true },
			},
			required: ["search"],
		});
		const { required, optional } = splitFields(form.fields);

		assert.deepEqual(
			required.map((found) => found.key),
			["search"],
		);
		assert.deepEqual(
			optional.map((found) => found.key),
			["replace", "dry_run"],
		);
	});

	it("counts a group as required when a field inside it is", () => {
		const form = toForm({
			type: "object",
			properties: {
				address: {
					type: "object",
					properties: { city: { type: "string" } },
					required: ["city"],
				},
				notes: {
					type: "object",
					properties: { text: { type: "string" } },
				},
			},
		});
		const { required, optional } = splitFields(form.fields);

		assert.deepEqual(
			required.map((found) => found.key),
			["address"],
		);
		assert.deepEqual(
			optional.map((found) => found.key),
			["notes"],
		);
	});

	it("keeps the schema's order on both sides", () => {
		const form = toForm({
			type: "object",
			properties: {
				a: { type: "string" },
				b: { type: "string" },
				c: { type: "string" },
				d: { type: "string" },
			},
			required: ["d", "b"],
		});
		const { required, optional } = splitFields(form.fields);

		assert.deepEqual(
			required.map((found) => found.key),
			["b", "d"],
		);
		assert.deepEqual(
			optional.map((found) => found.key),
			["a", "c"],
		);
	});
});

describe("hasErrorIn", () => {
	it("claims an error keyed by the field and by any row under it", () => {
		const form = toForm({
			type: "object",
			properties: {
				tags: { type: "array", items: { type: "string", minLength: 2 } },
				tagsLike: { type: "string" },
			},
		});
		const tags = field(form, "tags");
		const tagsLike = field(form, "tagsLike");
		const errors = fieldErrors(form, { tags: ["x"] });

		assert.deepEqual(Object.keys(errors), ["tags.0"]);
		assert.equal(hasErrorIn(tags, errors), true);
		// A prefix match on the name alone would blame the wrong field.
		assert.equal(hasErrorIn(tagsLike, errors), false);
	});
});
