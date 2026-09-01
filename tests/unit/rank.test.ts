import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type Rankable, rank, score } from "../../src/lib/rank.ts";

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
