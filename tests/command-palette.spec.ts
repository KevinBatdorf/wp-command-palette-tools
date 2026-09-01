import { expect, test } from "@wordpress/e2e-test-utils-playwright";

test.beforeEach(async ({ requestUtils }) => {
	await requestUtils.login();
});

const modifier = process.platform === "darwin" ? "Meta" : "Control";

test("Plugin is active and command palette opens", async ({ admin, page }) => {
	await admin.createNewPost({ title: "Test post" });
	await page.keyboard.press(`${modifier}+k`);
	await expect(page.locator(".commands-command-menu__container")).toBeVisible();
});

// The other test passes with the plugin deactivated; this one does not.
test("Math command renders and copies its result", async ({ admin, page }) => {
	await admin.createNewPost({ title: "Test post" });
	await page.keyboard.press(`${modifier}+k`);
	await page.keyboard.type("2+2");

	const result = page.getByRole("option", { name: "2+2 = 4" });
	await expect(result).toBeVisible();

	await result.click();
	await expect(page.locator(".components-snackbar")).toContainText(
		"Copied to clipboard!",
	);
});
