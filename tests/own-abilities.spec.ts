import {
	expect,
	RequestUtils,
	test,
} from "@wordpress/e2e-test-utils-playwright";
import { type Ability, runHref } from "../src/lib/abilities.ts";

const CATALOG = "/wp-abilities/v1/abilities";
const modifier = process.platform === "darwin" ? "Meta" : "Control";

// What each claims decides the run method and whether a confirm appears.
const BUNDLED: Record<
	string,
	{ category: string; readonly: boolean; destructive: boolean }
> = {
	"wpcp/list-cron-events": {
		category: "maintenance",
		readonly: true,
		destructive: false,
	},
	"wpcp/run-cron-event": {
		category: "maintenance",
		readonly: false,
		destructive: false,
	},
	"wpcp/list-autoloaded-options": {
		category: "maintenance",
		readonly: true,
		destructive: false,
	},
	"wpcp/list-unattached-media": {
		category: "maintenance",
		readonly: true,
		destructive: false,
	},
	"wpcp/delete-expired-transients": {
		category: "maintenance",
		readonly: false,
		destructive: true,
	},
	"wpcp/empty-trash": {
		category: "maintenance",
		readonly: false,
		destructive: true,
	},
	"wpcp/merge-terms": {
		category: "content",
		readonly: false,
		destructive: true,
	},
	"wpcp/reassign-author": {
		category: "content",
		readonly: false,
		destructive: false,
	},
	"wpcp/close-comments": {
		category: "content",
		readonly: false,
		destructive: false,
	},
	"wpcp/publish-missed-schedules": {
		category: "content",
		readonly: false,
		destructive: false,
	},
	"wpcp/search-replace-content": {
		category: "content",
		readonly: false,
		destructive: true,
	},
};

test.beforeEach(async ({ requestUtils }) => {
	await requestUtils.login();
});

test("every bundled ability reaches the catalog with the annotations it claims", async ({
	requestUtils,
}) => {
	const abilities = await requestUtils.rest<Ability[]>({
		path: CATALOG,
		params: { per_page: 100 },
	});
	const ours = new Map(
		abilities
			.filter(({ name }) => name.startsWith("wpcp/"))
			.map((ability) => [ability.name, ability]),
	);

	expect([...ours.keys()].sort()).toEqual(Object.keys(BUNDLED).sort());

	for (const [name, claim] of Object.entries(BUNDLED)) {
		const ability = ours.get(name);

		expect(ability?.category).toBe(claim.category);
		expect(ability?.meta?.annotations?.readonly ?? false).toBe(claim.readonly);
		expect(ability?.meta?.annotations?.destructive ?? false).toBe(
			claim.destructive,
		);
		// Both render in the palette, and an ability with neither is unfindable.
		expect(ability?.label).toBeTruthy();
		expect(ability?.description).toBeTruthy();
	}
});

// The name segment carries a slash, so only the published href reaches the route.
const run = async (
	utils: RequestUtils,
	name: string,
	method: string,
	input?: unknown,
) => {
	const abilities = await utils.rest<Ability[]>({
		path: CATALOG,
		params: { per_page: 100 },
	});
	const ability = abilities.find((candidate) => candidate.name === name);
	const href = ability && runHref(ability);
	if (!href) throw new Error(`${name} has no run href in the catalog`);

	const { nonce } = await utils.setupRest();
	const response = await utils.request.fetch(href, {
		method,
		headers: { "X-WP-Nonce": nonce, "content-type": "application/json" },
		data: JSON.stringify({ input }),
	});

	return { status: response.status(), body: await response.json() };
};

// A dry run that overcounts is worse than no dry run.
test("a dry run reports what it would change and changes nothing", async ({
	requestUtils,
}) => {
	const { id } = await requestUtils.rest<{ id: number }>({
		path: "/wp/v2/posts",
		method: "POST",
		data: {
			title: "Dry run subject",
			content: "keepsake and keepsake",
			status: "publish",
		},
	});

	const replace = (dryRun: boolean) =>
		run(requestUtils, "wpcp/search-replace-content", "POST", {
			search: "keepsake",
			replace: "heirloom",
			dry_run: dryRun,
		});
	const content = async () =>
		(
			await requestUtils.rest<{ content: { raw: string } }>({
				path: `/wp/v2/posts/${id}`,
				params: { context: "edit" },
			})
		).content.raw;

	const dry = await replace(true);
	expect(dry.status).toBe(200);
	expect(dry.body.replacements).toBe(2);
	expect(dry.body.posts_changed).toBe(1);
	expect(await content()).toContain("keepsake");

	expect((await replace(false)).body.replacements).toBe(2);

	const rewritten = await content();
	expect(rewritten).toContain("heirloom");
	expect(rewritten).not.toContain("keepsake");
});

test("one of ours runs read-only from the palette", async ({ admin, page }) => {
	await admin.visitAdminPage("plugins.php");
	await page.keyboard.press(`${modifier}+j`);
	await page.keyboard.type("autoloaded");

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette
		.getByRole("option", { name: "List autoloaded options" })
		.click();

	// Readonly, so core takes it on GET and the palette asks for no confirm.
	await palette.getByRole("button", { name: "Run", exact: true }).click();

	await expect(palette.getByRole("heading", { name: "Result" })).toBeVisible();
	await expect(palette.getByText('"total_bytes"')).toBeVisible();
	await expect(palette.getByText('"rewrite_rules"')).toBeVisible();
});

test("a destructive one stops at a confirm before it runs", async ({
	admin,
	page,
}) => {
	await admin.visitAdminPage("plugins.php");
	await page.keyboard.press(`${modifier}+j`);
	await page.keyboard.type("expired");

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette
		.getByRole("option", { name: "Delete expired transients" })
		.click();
	await expect(palette.getByText("This ability takes no input.")).toBeVisible();

	await palette.getByRole("button", { name: "Run", exact: true }).click();
	// Destructive, so nothing has happened yet.
	await expect(palette.getByRole("heading", { name: "Result" })).toBeHidden();
	await expect(
		palette.getByText(
			"This ability can delete data, and running it cannot be undone.",
		),
	).toBeVisible();

	await palette.getByRole("button", { name: "Run anyway" }).click();
	await expect(palette.getByRole("heading", { name: "Result" })).toBeVisible();
	await expect(palette.getByText('"expired_remaining"')).toBeVisible();
});

test("everything bundled here is refused to a user without manage_options", async ({
	requestUtils,
}) => {
	const password = "correct-horse-battery";
	await requestUtils.rest({
		path: "/wp/v2/users",
		method: "POST",
		data: {
			username: "edith",
			email: "edith@example.com",
			password,
			roles: ["editor"],
		},
	});

	const editor = await RequestUtils.setup({
		user: { username: "edith", password },
		baseURL: requestUtils.baseURL,
	});

	// Core gates its listing on being logged in, so an editor is shown all of
	// them and is turned down one layer later.
	const listed = await editor.rest<Ability[]>({
		path: CATALOG,
		params: { per_page: 100 },
	});
	expect(listed.map(({ name }) => name)).toEqual(
		expect.arrayContaining(Object.keys(BUNDLED)),
	);

	// One gate, so the method an ability answers on makes no difference to it.
	for (const [name, method, input] of [
		["wpcp/list-cron-events", "GET", undefined],
		["wpcp/close-comments", "POST", { older_than_days: 1 }],
		["wpcp/empty-trash", "DELETE", { targets: ["posts"] }],
	] as const) {
		const refused = await run(editor, name, method, input);

		expect(refused.status, name).toBe(403);
		expect(refused.body.code, name).toBe("rest_ability_cannot_execute");
	}

	// The session itself is fine, so those refusals are the gate and not the login.
	const me = await editor.rest<{ slug: string }>({ path: "/wp/v2/users/me" });
	expect(me.slug).toBe("edith");
});

test("an upload named only in post content is not called unattached", async ({
	requestUtils,
}) => {
	const png = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
		"base64",
	);
	const upload = (name: string) =>
		requestUtils.rest<{ id: number; source_url: string }>({
			method: "POST",
			path: "/wp/v2/media",
			multipart: { file: { name, mimeType: "image/png", buffer: png } },
		});

	const inContent = await upload("referenced.png");
	const orphan = await upload("orphan.png");

	await requestUtils.rest({
		path: "/wp/v2/posts",
		method: "POST",
		data: {
			title: "Uses an image",
			content: `<figure class="wp-block-image"><img src="${inContent.source_url}" class="wp-image-${inContent.id}"/></figure>`,
			status: "publish",
		},
	});

	const listed = await run(requestUtils, "wpcp/list-unattached-media", "GET", {
		limit: 200,
	});
	const ids = listed.body.media.map((item: { id: number }) => item.id);

	expect(ids).toContain(orphan.id);
	expect(ids).not.toContain(inContent.id);
});
