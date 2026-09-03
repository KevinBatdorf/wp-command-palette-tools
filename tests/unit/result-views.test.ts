import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
	bytes,
	duration,
	resultView,
	when,
} from "../../src/lib/result-views.ts";

// Captured off WP 7.1 with WooCommerce 11 installed, not written by hand.
const OUTPUT: Record<string, unknown> = JSON.parse(
	readFileSync(
		new URL("./fixtures/ability-output.json", import.meta.url),
		"utf8",
	),
);

const table = (name: string, input?: unknown) => {
	const view = resultView(name, OUTPUT[name], input);
	assert.equal(view.kind, "table");
	return view;
};

const summary = (name: string) => {
	const view = resultView(name, OUTPUT[name]);
	assert.equal(view.kind, "summary");
	return view;
};

describe("resultView", () => {
	it("hands every scheduled event the input that runs it", () => {
		const view = table("wpcp/list-cron-events");
		const [first] = view.rows;

		assert.deepEqual(first.actions, [
			{
				key: "run-now",
				ability: "wpcp/run-cron-event",
				input: { hook: "recovery_mode_clean_expired_keys" },
			},
		]);
		assert.equal(first.cells[0], "recovery_mode_clean_expired_keys");
		assert.equal(first.cells[1], "daily");
	});

	it("counts what the event listing found", () => {
		const view = table("wpcp/list-cron-events");

		assert.deepEqual(
			view.stats.map((entry) => entry.key),
			["total", "overdue"],
		);
	});

	it("carries a product id into both of the abilities that need one", () => {
		const view = table("woocommerce/products-query");
		const [first] = view.rows;

		assert.deepEqual(
			first.actions.map((action) => [action.ability, action.input]),
			[
				["woocommerce/product-update", { id: 14 }],
				["woocommerce/product-delete", { id: 14 }],
			],
		);
		assert.equal(
			first.actions.find((action) => action.key === "delete")?.destructive,
			true,
		);
	});

	it("prices a product with the currency the site answered with", () => {
		const [first] = table("woocommerce/products-query").rows;

		assert.equal(first.cells[1], "$89.00");
	});

	it("carries an order id into a status change and a note", () => {
		const [first] = table("woocommerce/orders-query").rows;

		assert.deepEqual(
			first.actions.map((action) => [action.ability, action.input]),
			[
				["woocommerce/order-update-status", { id: 17 }],
				["woocommerce/order-add-note", { id: 17 }],
			],
		);
	});

	it("offers the real replace only after a dry run that matched", () => {
		const input = { search: "keepsake", replace: "heirloom", dry_run: true };
		const view = table("wpcp/search-replace-content", input);

		assert.deepEqual(view.actions, [
			{
				key: "apply-for-real",
				ability: "wpcp/search-replace-content",
				input: { search: "keepsake", replace: "heirloom", dry_run: false },
				destructive: true,
			},
		]);
	});

	it("offers nothing to apply when the dry run matched nothing", () => {
		const view = resultView(
			"wpcp/search-replace-content",
			{ dry_run: true, posts: [], posts_changed: 0, replacements: 0 },
			{ search: "nothing" },
		);

		assert.equal(view.kind, "table");
		assert.deepEqual(view.actions, []);
	});

	it("does not offer to redo a replace that already happened", () => {
		const view = resultView(
			"wpcp/search-replace-content",
			{ dry_run: false, posts: [{ id: 3, title: "One", replacements: 2 }] },
			{ search: "keepsake" },
		);

		assert.equal(view.kind, "table");
		assert.deepEqual(view.actions, []);
	});

	it("names the user and offers to hand their posts on", () => {
		const view = summary("core/get-user-info");

		assert.deepEqual(view.items[0], { label: "Name", value: "admin" });
		assert.deepEqual(view.actions, [
			{
				key: "reassign-from",
				ability: "wpcp/reassign-author",
				input: { from: "admin" },
			},
		]);
	});

	it("lists an ability with no view of its own as its own keys", () => {
		const view = summary("core/get-environment-info");

		assert.deepEqual(
			view.items.map((item) => item.label),
			["environment", "php_version", "db_server_info", "wp_version"],
		);
		assert.deepEqual(view.actions, []);
	});

	it("links a value that is a URL", () => {
		const view = summary("core/get-site-info");
		const url = view.items.find((item) => item.label === "url");

		assert.equal(url?.href, "http://127.0.0.1:9501");
	});

	it("falls back to JSON for an output that is not an object", () => {
		assert.deepEqual(resultView("some/plugin-ability", [1, 2]), {
			kind: "json",
			value: [1, 2],
		});
	});

	it("says an ability returned nothing rather than printing null", () => {
		const view = resultView("some/plugin-ability", null);

		assert.equal(view.kind, "summary");
		assert.deepEqual(view, {
			kind: "summary",
			items: [],
			stats: [],
			actions: [],
		});
	});

	it("reports what a run changed instead of the object it changed it in", () => {
		const view = resultView("wpcp/empty-trash", {
			deleted: { posts: 4, comments: 1, spam: 2 },
			trashed_posts_remaining: 9,
		});

		assert.equal(view.kind, "summary");
		assert.deepEqual(view.stats, [
			{ key: "deleted", value: "7" },
			{ key: "remaining", value: "9" },
		]);
	});
});

describe("formatting", () => {
	it("scales bytes the way the options table counts them", () => {
		assert.equal(bytes(512), "512 B");
		assert.equal(bytes(23776), "23.2 KB");
		assert.equal(bytes(4 * 1024 * 1024), "4.0 MB");
	});

	it("drops to the largest unit that still says something", () => {
		assert.equal(duration(45), "45s");
		assert.equal(duration(600), "10m");
		assert.equal(duration(33554), "9h 19m");
		assert.equal(duration(60 * 60 * 50), "2d 2h");
	});

	it("trims a timestamp to the minute in either shape core returns", () => {
		assert.equal(when("2026-09-02T16:15:32+00:00"), "2026-09-02 16:15");
		assert.equal(when("2026-09-02 16:16:06"), "2026-09-02 16:16");
		assert.equal(when(undefined), "—");
	});
});
