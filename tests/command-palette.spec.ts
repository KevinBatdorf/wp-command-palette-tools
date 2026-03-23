import { expect, test } from "@wordpress/e2e-test-utils-playwright";

test.beforeEach(async ({ requestUtils }) => {
	await requestUtils.login();
});

test("Plugin is active and command palette opens", async ({ admin, page }) => {
	await admin.createNewPost({ title: "Test post" });
	// Open the command palette with Cmd+K / Ctrl+K
	await page.keyboard.press("Meta+k");
	// Verify the command palette is visible
	await expect(page.locator(".commands-command-menu__container")).toBeVisible();
});
