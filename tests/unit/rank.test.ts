import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type Rankable, rank, rankFused, score } from "../../src/lib/rank.ts";
import similarityFixture from "./fixtures/similarities.json" with {
	type: "json",
};

// Close to what core and a plugin actually register.
const catalog: Rankable[] = [
	{
		id: "core/get-site-info",
		label: "Get Site Information",
		description: "Returns site information configured in WordPress.",
		keywords: ["core/get-site-info"],
	},
	{
		id: "core/get-user-info",
		label: "Get User Information",
		description: "Returns information about the current user.",
		keywords: ["core/get-user-info"],
	},
	{
		id: "core/get-environment-info",
		label: "Get Environment Info",
		description: "Returns the PHP and WordPress versions of this site.",
		keywords: ["core/get-environment-info"],
	},
	{
		id: "woo/update-price",
		label: "Update product price",
		description: "Sets the price on a product in the store.",
		keywords: ["woo/update-price"],
	},
];

const ids = (results: Rankable[]) => results.map(({ id }) => id);

describe("rank", () => {
	it("leaves the catalog alone when nothing has been typed", () => {
		assert.deepEqual(ids(rank(catalog, "   ")), ids(catalog));
	});

	it("puts the intended ability first", () => {
		assert.equal(rank(catalog, "user")[0].id, "core/get-user-info");
		assert.equal(rank(catalog, "price")[0].id, "woo/update-price");
		assert.equal(
			rank(catalog, "php version")[0].id,
			"core/get-environment-info",
		);
	});

	it("prefers a label match over a description match", () => {
		// "site" is in three descriptions and one label.
		assert.equal(rank(catalog, "site")[0].id, "core/get-site-info");
	});

	it("narrows as more words are typed", () => {
		// "Info" is a whole word only in the environment label; the others tie.
		assert.deepEqual(ids(rank(catalog, "get info")), [
			"core/get-environment-info",
			"core/get-site-info",
			"core/get-user-info",
		]);
		assert.deepEqual(ids(rank(catalog, "get price")), []);
	});

	it("finds an ability by the name nothing displays", () => {
		assert.deepEqual(ids(rank(catalog, "woo")), ["woo/update-price"]);
	});

	it("breaks a tie towards what was used last", () => {
		const [first] = rank(catalog, "get info", ["core/get-user-info"]);
		assert.equal(first.id, "core/get-user-info");
	});

	it("does not let recency rescue an ability the text rejected", () => {
		assert.deepEqual(ids(rank(catalog, "price", ["core/get-site-info"])), [
			"woo/update-price",
		]);
	});
});

describe("score", () => {
	it("ignores punctuation and case in the query", () => {
		const [item] = catalog;
		assert.ok(score(item, "GET, SITE!") > 0);
	});

	it("scores nothing for a query no field carries", () => {
		assert.equal(score(catalog[0], "checkout"), 0);
		assert.equal(score(catalog[0], ""), 0);
	});

	it("ranks an exact label above a label that merely contains it", () => {
		const exact = { id: "a", label: "Confetti" };
		const partial = { id: "b", label: "Confetti (3 seconds delay)" };
		assert.ok(score(exact, "confetti") > score(partial, "confetti"));
	});
});

describe("rankFused", () => {
	// Real MiniLM output for this catalog, not numbers invented for the test.
	const { similarities } = similarityFixture;
	const of = (query: keyof typeof similarities): ((id: string) => number) => {
		const row: Record<string, number> = similarities[query];
		return (id) => row[id] ?? 0;
	};

	it("finds the ability a query shares no word with", () => {
		const results = rankFused(catalog, "make my shop items cheaper", {
			similarity: of("make my shop items cheaper"),
		});
		assert.equal(results[0].id, "woo/update-price");

		assert.equal(
			rankFused(catalog, "who am i logged in as", {
				similarity: of("who am i logged in as"),
			})[0].id,
			"core/get-user-info",
		);
	});

	it("answers nothing for a query the catalog has no ability for", () => {
		assert.deepEqual(
			ids(
				rankFused(catalog, "pizza recipe", { similarity: of("pizza recipe") }),
			),
			[],
		);
	});

	it("leaves the lexical order alone when no vectors arrived", () => {
		for (const query of ["user", "price", "php version", "get info", "site"]) {
			assert.deepEqual(
				ids(rankFused(catalog, query)),
				ids(rank(catalog, query)),
				query,
			);
		}
	});

	it("keeps a label match ahead of a better cosine", () => {
		// Every other ability is scored a near-perfect match on purpose.
		const results = rankFused(catalog, "price", {
			similarity: (id) => (id === "woo/update-price" ? 0.349 : 0.95),
		});
		assert.equal(results[0].id, "woo/update-price");
	});

	it("still lets recency break a tie", () => {
		const tied = ["core/get-site-info", "core/get-user-info"];
		const results = rankFused(catalog, "information", {
			recents: ["core/get-user-info"],
			similarity: () => 0,
		});
		assert.deepEqual(ids(results).slice(0, 2), tied.toReversed());
	});
});
