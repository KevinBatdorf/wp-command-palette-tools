import { expect, test } from "@wordpress/e2e-test-utils-playwright";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ requestUtils, page }) => {
	await requestUtils.login();
	await page.goto("/");
});

test("Cmd+K opens the palette on the front end", async ({ page }) => {
	// Core's palette is enqueued for wp-admin only, so the key is free here.
	await page.keyboard.press(`${modifier}+k`);

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await expect(palette).toBeVisible();
	await expect(palette.getByRole("option").first()).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(palette).toBeHidden();
});

test("the admin bar item opens it here too", async ({ page }) => {
	await page.locator("#wp-admin-bar-wpcp-tools-palette a").click();

	await expect(
		page.getByRole("dialog", { name: "Ability palette" }),
	).toBeVisible();
});

test("it arrives styled without wp-admin having enqueued anything", async ({
	page,
}) => {
	// The front end serves a link per handle rather than the admin's concatenation.
	const bundled = await page.evaluate(() =>
		[...document.querySelectorAll("link[rel=stylesheet]")].some((link) =>
			(link as HTMLLinkElement).href.includes("css/dist/commands/"),
		),
	);
	// Only our own style dependency can have put core's palette CSS here.
	expect(bundled).toBe(true);

	await page.keyboard.press(`${modifier}+j`);
	const input = page
		.getByRole("dialog", { name: "Ability palette" })
		.getByRole("combobox");
	await expect(input).toBeVisible();

	// Unstyled, the input would sit at the browser default of about 13px.
	const fontSize = await input.evaluate((el) => getComputedStyle(el).fontSize);
	expect(Number.parseFloat(fontSize)).toBeGreaterThan(14);
});

test("an ability runs from the front end", async ({ page }) => {
	await page.keyboard.press(`${modifier}+j`);

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette.getByRole("option", { name: /Get Site Information/ }).click();

	// Nothing outside wp-admin would authenticate without api-fetch's nonce.
	await expect(palette.getByRole("heading", { name: "Result" })).toBeVisible();
	await expect(palette.getByText(/127\.0\.0\.1/).first()).toBeVisible();
});

test("recents follow the user between the front end and wp-admin", async ({
	admin,
	page,
}) => {
	await page.keyboard.press(`${modifier}+j`);

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette.getByRole("option", { name: /Get User Information/ }).click();
	await expect(
		palette.getByRole("heading", { name: "Get User Information" }),
	).toBeVisible();

	await admin.visitAdminPage("plugins.php");
	await page.keyboard.press(`${modifier}+j`);

	// Both contexts have to agree on the user id the history is filed under.
	await expect(palette.getByText("Recent")).toBeVisible();
	await expect(palette.getByRole("option").first()).toContainText(
		"Get User Information",
	);
});
