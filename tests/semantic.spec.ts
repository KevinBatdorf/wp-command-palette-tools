import { expect, test } from "@wordpress/e2e-test-utils-playwright";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

// 7.5MB of weights and vocabulary off a local PHP server, then a pooled mean.
const MODEL_LOAD = 60_000;

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

	// Every word has to land for the lexical pass to admit anything, and "who"
	// lands nowhere.
	await expect(
		palette.getByRole("option", { name: /Get User Information/ }),
	).toBeVisible({ timeout: MODEL_LOAD });
});

test("still answers lexically when the weights will not load", async ({
	admin,
	page,
}) => {
	await admin.visitAdminPage("plugins.php");
	// Read on first use, so pointing it at nothing is a model that cannot load.
	await page.evaluate(() => {
		window.wpcpTools = { ...window.wpcpTools, modelPath: "does-not-exist/" };
	});

	await page.keyboard.press(`${modifier}+j`);
	const palette = page.getByRole("dialog", { name: "Ability palette" });
	const input = palette.getByRole("combobox");

	await input.fill("who am i logged in as");
	await expect(palette.getByText("No results found.")).toBeVisible();

	// A query sharing a word still finds its ability.
	await input.fill("user");
	await expect(
		palette.getByRole("option", { name: /Get User Information/ }),
	).toBeVisible();
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
