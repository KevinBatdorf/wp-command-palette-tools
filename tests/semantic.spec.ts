import { expect, test } from "@wordpress/e2e-test-utils-playwright";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

// The model and the runtime wasm are 35MB off a local PHP server.
const MODEL_LOAD = 150_000;

test.beforeEach(async ({ requestUtils }) => {
	test.setTimeout(180_000);
	await requestUtils.login();
});

test("finds an ability the query shares no word with", async ({
	admin,
	page,
}) => {
	await admin.visitAdminPage("plugins.php");
	await page.keyboard.press(`${modifier}+j`);

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await page.keyboard.type("who am i logged in as");

	// "who" lands nowhere, so the lexical pass rejects the whole catalog first.
	await expect(palette.getByText("No results found.")).toBeVisible();

	await expect(
		palette.getByRole("option", { name: /Get User Information/ }),
	).toBeVisible({ timeout: MODEL_LOAD });
});

test("answers nothing for a query the catalog has no ability for", async ({
	admin,
	page,
}) => {
	await admin.visitAdminPage("plugins.php");
	await page.keyboard.press(`${modifier}+j`);

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	const input = palette.getByRole("combobox");

	// A semantic match, so reaching it proves the model is loaded and answering.
	await input.fill("get rid of deleted stuff for good");
	await expect(
		palette.getByRole("option", { name: /Empty the trash/ }),
	).toBeVisible({ timeout: MODEL_LOAD });

	await input.fill("pizza recipe");

	await expect(palette.getByText("No results found.")).toBeVisible();
	await expect(palette.getByRole("option")).toHaveCount(0);
});
