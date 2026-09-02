import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	type Ability,
	abilitySource,
	type Catalog,
	catalogHash,
	catalogState,
	createCatalogLoader,
	onlyRunnable,
	runHref,
	runnableNames,
} from "../../src/lib/abilities.ts";

const ability = (overrides: Partial<Ability> = {}): Ability => ({
	name: "core/get-site-info",
	label: "Get Site Information",
	description: "Returns site information configured in WordPress.",
	category: "site",
	input_schema: { type: "object", properties: {} },
	meta: { annotations: { readonly: true, destructive: false } },
	_links: {
		"wp:action-run": [
			{ href: "https://example.com/wp-json/wp-abilities/v1/abilities/x/run" },
		],
	},
	...overrides,
});

describe("runHref", () => {
	it("reads the run link core advertises", () => {
		assert.equal(
			runHref(ability()),
			"https://example.com/wp-json/wp-abilities/v1/abilities/x/run",
		);
	});

	it("returns null when the ability cannot be run over REST", () => {
		assert.equal(runHref(ability({ _links: {} })), null);
		assert.equal(runHref(ability({ _links: undefined })), null);
	});
});

describe("catalogHash", () => {
	it("ignores the order the listing came back in", () => {
		const a = ability({ name: "core/a" });
		const b = ability({ name: "core/b" });
		assert.equal(catalogHash([a, b]), catalogHash([b, a]));
	});

	it("changes when an ability's text changes", () => {
		const before = catalogHash([ability()]);
		assert.notEqual(before, catalogHash([ability({ label: "Site info" })]));
		assert.notEqual(before, catalogHash([ability({ description: "Other." })]));
		assert.notEqual(before, catalogHash([ability(), ability({ name: "x/y" })]));
	});

	it("does not collide an empty catalog with a populated one", () => {
		assert.notEqual(catalogHash([]), catalogHash([ability()]));
	});
});

describe("createCatalogLoader", () => {
	it("returns what the listing gave it, with a hash", async () => {
		const abilities = [ability()];
		const loader = createCatalogLoader(async () => abilities);

		const catalog = await loader.load();

		assert.deepEqual(catalog.abilities, abilities);
		assert.equal(catalog.hash, catalogHash(abilities));
		assert.equal(catalog.error, null);
	});

	it("reports an empty catalog without an error", async () => {
		const catalog = await createCatalogLoader(async () => []).load();

		assert.deepEqual(catalog.abilities, []);
		assert.equal(catalog.error, null);
	});

	it("surfaces the REST error code instead of throwing", async () => {
		const loader = createCatalogLoader(async () => {
			throw { code: "rest_no_route", message: "No route was found." };
		});

		const catalog = await loader.load();

		assert.deepEqual(catalog.abilities, []);
		assert.equal(catalog.error, "rest_no_route");
	});

	it("falls back to a generic code for a thrown non-REST error", async () => {
		const loader = createCatalogLoader(async () => {
			throw new TypeError("Failed to fetch");
		});

		assert.equal((await loader.load()).error, "unknown_error");
	});

	it("rejects a response that is not a list", async () => {
		const loader = createCatalogLoader(async () => ({ abilities: [] }));

		assert.equal((await loader.load()).error, "unexpected_response");
	});

	it("drops entries that are not abilities", async () => {
		const loader = createCatalogLoader(async () => [
			ability(),
			{ name: "core/nameless" },
			null,
			"core/get-site-info",
		]);

		assert.deepEqual(
			(await loader.load()).abilities.map(({ name }) => name),
			["core/get-site-info"],
		);
	});

	it("fetches once for concurrent and repeat callers", async () => {
		let calls = 0;
		const loader = createCatalogLoader(async () => {
			calls++;
			return [ability()];
		});

		await Promise.all([loader.load(), loader.load()]);
		await loader.load();

		assert.equal(calls, 1);
	});

	it("retries after a failure but not after a success", async () => {
		let calls = 0;
		const loader = createCatalogLoader(async () => {
			calls++;
			if (calls === 1) throw { code: "rest_forbidden" };
			return [ability()];
		});

		assert.equal((await loader.load()).error, "rest_forbidden");
		assert.equal((await loader.load()).error, null);
		await loader.load();

		assert.equal(calls, 2);
	});

	it("refetches after clear", async () => {
		let calls = 0;
		const loader = createCatalogLoader(async () => {
			calls++;
			return [];
		});

		await loader.load();
		loader.clear();
		await loader.load();

		assert.equal(calls, 2);
	});
});

describe("catalogState", () => {
	const catalog = (overrides: Partial<Catalog> = {}): Catalog => ({
		abilities: [ability()],
		hash: "x",
		error: null,
		...overrides,
	});

	it("separates nothing registered from nothing loaded", () => {
		assert.equal(catalogState(catalog()), "ready");
		assert.equal(catalogState(catalog({ abilities: [] })), "empty");
	});

	it("tells a missing route apart from a refused one", () => {
		assert.equal(
			catalogState(catalog({ abilities: [], error: "rest_no_route" })),
			"unavailable",
		);
		assert.equal(
			catalogState(catalog({ abilities: [], error: "rest_forbidden" })),
			"forbidden",
		);
		assert.equal(
			catalogState(
				catalog({ abilities: [], error: "rest_cookie_invalid_nonce" }),
			),
			"forbidden",
		);
	});

	it("falls back to a plain failure for an unrecognised code", () => {
		assert.equal(
			catalogState(catalog({ abilities: [], error: "unknown_error" })),
			"failed",
		);
	});
});

describe("abilitySource", () => {
	it("names the plugin the ability came from alongside its category", () => {
		assert.equal(abilitySource(ability()), "core:site");
		assert.equal(
			abilitySource(ability({ name: "woo/update-price", category: "product" })),
			"woo:product",
		);
	});

	it("falls back when either half is missing", () => {
		assert.equal(abilitySource(ability({ name: "nameless" })), "site");
		assert.equal(abilitySource(ability({ category: "" })), "core");
	});
});

describe("runnableNames", () => {
	it("reads the names the route reported", () => {
		const names = runnableNames({ names: ["wpcp/a", "wpcp/b"] });

		assert.deepEqual([...(names ?? [])], ["wpcp/a", "wpcp/b"]);
	});

	it("is null for anything that is not a list of names", () => {
		assert.equal(runnableNames(undefined), null);
		assert.equal(runnableNames({}), null);
		assert.equal(runnableNames({ names: "wpcp/a" }), null);
	});

	it("keeps an empty list, which means nothing is runnable", () => {
		assert.deepEqual([...(runnableNames({ names: [] }) ?? [])], []);
	});
});

describe("onlyRunnable", () => {
	const abilities = [
		ability({ name: "wpcp/allowed" }),
		ability({ name: "wpcp/refused" }),
	];

	it("drops what the current user would only be refused", () => {
		const kept = onlyRunnable(abilities, new Set(["wpcp/allowed"]));

		assert.deepEqual(
			kept.map(({ name }) => name),
			["wpcp/allowed"],
		);
	});

	// A dead probe must not empty the palette.
	it("filters nothing when there is no answer", () => {
		assert.deepEqual(onlyRunnable(abilities, null), abilities);
	});
});

describe("createCatalogLoader with a runnable probe", () => {
	const listing = [
		ability({ name: "wpcp/allowed" }),
		ability({ name: "wpcp/refused" }),
	];

	it("leaves out abilities the run would refuse", async () => {
		const loader = createCatalogLoader(
			async () => listing,
			async () => ({ names: ["wpcp/allowed"] }),
		);

		const catalog = await loader.load();

		assert.deepEqual(
			catalog.abilities.map(({ name }) => name),
			["wpcp/allowed"],
		);
		// The hash follows what is shown, so two users can hold different ones.
		assert.equal(catalog.hash, catalogHash(catalog.abilities));
	});

	it("shows the whole listing when the probe fails", async () => {
		const loader = createCatalogLoader(
			async () => listing,
			async () => {
				throw new Error("no route");
			},
		);

		assert.equal((await loader.load()).abilities.length, 2);
	});

	it("shows the whole listing when the probe answers nonsense", async () => {
		const loader = createCatalogLoader(
			async () => listing,
			async () => "not a payload",
		);

		assert.equal((await loader.load()).abilities.length, 2);
	});
});
