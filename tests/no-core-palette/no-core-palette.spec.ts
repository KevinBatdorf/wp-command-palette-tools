import { expect, test } from "@wordpress/e2e-test-utils-playwright";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ requestUtils, admin }) => {
	await requestUtils.login();
	await admin.visitAdminPage("plugins.php");
});

test("core's palette really is absent", async ({ page }) => {
	// The control: every other suite runs with core's palette mounted.
	expect(await page.evaluate(() => typeof window.wp?.commands)).toBe(
		"undefined",
	);

	await page.keyboard.press(`${modifier}+k`);
	await expect(
		page.getByRole("dialog", { name: "Command palette" }),
	).toBeHidden();
});

test("Cmd+K falls to us when nothing else claims it", async ({ page }) => {
	await page.keyboard.press(`${modifier}+k`);

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await expect(palette).toBeVisible();
	await expect(palette.getByRole("option").first()).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(palette).toBeHidden();
});

test("Cmd+J still opens it", async ({ page }) => {
	await page.keyboard.press(`${modifier}+j`);

	await expect(
		page.getByRole("dialog", { name: "Ability palette" }),
	).toBeVisible();
});

test("it still looks like core's palette", async ({ page }) => {
	// The admin concatenates styles, so no per-handle link exists.
	const bundled = await page.evaluate(() =>
		[...document.querySelectorAll("link[rel=stylesheet]")].some((link) =>
			decodeURIComponent((link as HTMLLinkElement).href).includes(
				"wp-commands",
			),
		),
	);
	// Nothing else enqueues it now, so our own style dependency put it there.
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
