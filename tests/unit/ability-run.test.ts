import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Ability, JsonSchema } from "../../src/lib/abilities.ts";
import {
	coerceInput,
	confirmKind,
	hasUnfillable,
	runFailure,
	runMethod,
	runRequest,
} from "../../src/lib/ability-run.ts";
import { toForm } from "../../src/lib/schema-form.ts";

const HREF = "https://example.com/wp-json/wp-abilities/v1/abilities/x/y/run";

const ability = (
	annotations: Record<string, boolean>,
	href: string | null = HREF,
): Ability => ({
	name: "x/y",
	label: "Y",
	description: "",
	category: "site",
	meta: { annotations },
	_links: href ? { "wp:action-run": [{ href }] } : {},
});

// What all three of core's abilities ship on WP 7.1.
const CORE_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		fields: {
			type: "array",
			items: { type: "string", enum: ["name", "url", "language"] },
		},
	},
	additionalProperties: false,
	default: {},
};

describe("runMethod", () => {
	it("reads the method core expects off the annotations", () => {
		assert.equal(runMethod(ability({ readonly: true })), "GET");
		assert.equal(
			runMethod(ability({ destructive: true, idempotent: true })),
			"DELETE",
		);
		assert.equal(runMethod(ability({ destructive: true })), "POST");
		assert.equal(runMethod(ability({ idempotent: true })), "POST");
		assert.equal(runMethod(ability({})), "POST");
	});

	it("posts when an ability annotates nothing at all", () => {
		const bare: Ability = {
			name: "x/y",
			label: "Y",
			description: "",
			category: "site",
		};

		assert.equal(runMethod(bare), "POST");
	});

	it("follows core and treats a readonly destructive ability as readonly", () => {
		assert.equal(
			runMethod(
				ability({ readonly: true, destructive: true, idempotent: true }),
			),
			"GET",
		);
	});
});

describe("confirmKind", () => {
	it("lets a readonly ability run without asking", () => {
		assert.equal(confirmKind(ability({ readonly: true })), "none");
	});

	it("asks before anything that is not readonly", () => {
		assert.equal(confirmKind(ability({})), "changes");
		assert.equal(confirmKind(ability({ idempotent: true })), "changes");
	});

	it("asks harder when the ability is destructive", () => {
		assert.equal(confirmKind(ability({ destructive: true })), "destructive");
		assert.equal(
			confirmKind(ability({ destructive: true, idempotent: true })),
			"destructive",
		);
	});

	it("still asks when readonly and destructive contradict each other", () => {
		assert.equal(
			confirmKind(ability({ readonly: true, destructive: true })),
			"destructive",
		);
	});
});

describe("runRequest", () => {
	it("carries the input in the query string for GET", () => {
		const request = runRequest(ability({ readonly: true }), {
			fields: ["name", "url"],
		});

		assert.deepEqual(request, {
			method: "GET",
			url: `${HREF}?input%5Bfields%5D%5B0%5D=name&input%5Bfields%5D%5B1%5D=url`,
		});
	});

	it("carries the input in the query string for DELETE", () => {
		const request = runRequest(
			ability({ destructive: true, idempotent: true }),
			{ id: 7 },
		);

		assert.deepEqual(request, {
			method: "DELETE",
			url: `${HREF}?input%5Bid%5D=7`,
		});
	});

	it("carries the input in the body for POST", () => {
		const request = runRequest(ability({}), { title: "Hi" });

		assert.deepEqual(request, {
			method: "POST",
			url: HREF,
			data: { input: { title: "Hi" } },
		});
	});

	it("sends no input at all when the form filled nothing in", () => {
		assert.deepEqual(runRequest(ability({ readonly: true }), undefined), {
			method: "GET",
			url: HREF,
		});
		assert.deepEqual(runRequest(ability({}), undefined), {
			method: "POST",
			url: HREF,
			data: { input: undefined },
		});
	});

	it("leaves no dangling separator when nothing survives the query string", () => {
		assert.deepEqual(runRequest(ability({ readonly: true }), {}), {
			method: "GET",
			url: HREF,
		});
	});

	it("refuses an ability the listing gave no run link", () => {
		assert.equal(runRequest(ability({ readonly: true }, null), {}), null);
	});
});

describe("coerceInput", () => {
	it("sends only the fields the form shows", () => {
		const form = toForm(CORE_SCHEMA);

		assert.deepEqual(coerceInput(form, { fields: ["name"], sneaked: "in" }), {
			fields: ["name"],
		});
	});

	it("drops a set nobody ticked", () => {
		assert.equal(coerceInput(toForm(CORE_SCHEMA), { fields: [] }), undefined);
	});

	it("turns a typed number into a number", () => {
		const form = toForm({
			type: "object",
			properties: { count: { type: "integer" }, ratio: { type: "number" } },
		});

		assert.deepEqual(coerceInput(form, { count: "3", ratio: "1.5" }), {
			count: 3,
			ratio: 1.5,
		});
	});

	it("keeps a toggle that is off and drops one nobody touched", () => {
		const form = toForm({
			type: "object",
			properties: { live: { type: "boolean" }, draft: { type: "boolean" } },
		});

		assert.deepEqual(coerceInput(form, { live: false }), { live: false });
	});

	it("drops an optional field left blank", () => {
		const form = toForm({
			type: "object",
			properties: { title: { type: "string" }, slug: { type: "string" } },
		});

		assert.deepEqual(coerceInput(form, { title: "Hi", slug: "" }), {
			title: "Hi",
		});
	});

	it("keeps a nested object's filled properties and drops the rest", () => {
		const form = toForm({
			type: "object",
			properties: {
				meta: {
					type: "object",
					properties: {
						author: { type: "string" },
						views: { type: "integer" },
					},
				},
			},
		});

		assert.deepEqual(
			coerceInput(form, { meta: { author: "Kevin", views: "" } }),
			{
				meta: { author: "Kevin" },
			},
		);
	});

	it("keeps every row of a list in order", () => {
		const form = toForm({
			type: "object",
			properties: { tags: { type: "array", items: { type: "string" } } },
		});

		assert.deepEqual(coerceInput(form, { tags: ["one", "two"] }), {
			tags: ["one", "two"],
		});
	});

	it("sends a single non-object input as the whole input", () => {
		assert.equal(
			coerceInput(toForm({ type: "string" }), "just this"),
			"just this",
		);
	});

	it("sends nothing for a control it refused to render", () => {
		const form = toForm({
			type: "object",
			properties: { either: { anyOf: [{ type: "string" }] } },
		});

		assert.equal(coerceInput(form, { either: "typed anyway" }), undefined);
	});
});

describe("hasUnfillable", () => {
	it("blocks a required field no control can fill", () => {
		const form = toForm({
			type: "object",
			properties: { either: { anyOf: [{ type: "string" }] } },
			required: ["either"],
		});

		assert.equal(hasUnfillable(form), true);
	});

	it("allows a form whose refused field is optional", () => {
		const form = toForm({
			type: "object",
			properties: { either: { anyOf: [{ type: "string" }] } },
		});

		assert.equal(hasUnfillable(form), false);
	});

	it("looks inside a nested object", () => {
		const form = toForm({
			type: "object",
			properties: {
				meta: {
					type: "object",
					properties: { either: { anyOf: [{ type: "string" }] } },
					required: ["either"],
				},
			},
		});

		assert.equal(hasUnfillable(form), true);
	});

	it("allows the form core ships", () => {
		assert.equal(hasUnfillable(toForm(CORE_SCHEMA)), false);
	});
});

describe("runFailure", () => {
	it("keeps the message the site sent back", () => {
		assert.deepEqual(
			runFailure({
				code: "ability_invalid_input",
				message: 'Ability "x/y" has invalid input.',
				data: { status: 400 },
			}),
			{
				code: "ability_invalid_input",
				message: 'Ability "x/y" has invalid input.',
			},
		);
	});

	it("shows nothing when the request never reached the site", () => {
		assert.deepEqual(runFailure(new TypeError("Failed to fetch")), {
			code: "unknown_error",
			message: null,
		});
		assert.deepEqual(runFailure(undefined), {
			code: "unknown_error",
			message: null,
		});
	});
});
