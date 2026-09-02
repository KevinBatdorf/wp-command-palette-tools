import { expect, test } from "@wordpress/e2e-test-utils-playwright";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ requestUtils }) => {
	await requestUtils.login();
});

test("opens and closes on any admin screen", async ({ admin, page }) => {
	const palette = page.getByRole("dialog", { name: "Ability palette" });

	for (const screen of ["plugins.php", "edit.php", "options-general.php"]) {
		await admin.visitAdminPage(screen);

		await page.keyboard.press(`${modifier}+j`);
		await expect(palette).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(palette).toBeHidden();
	}
});

test("lists the abilities core registers and narrows them by search", async ({
	admin,
	page,
}) => {
	await admin.visitAdminPage("plugins.php");
	await page.keyboard.press(`${modifier}+j`);

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await expect(palette.getByRole("option")).toHaveText([
		/Get Site Information/,
		/Get User Information/,
		/Get Environment Info/,
	]);

	// Typing reaches the field only because the palette focuses it on open.
	await page.keyboard.type("user");
	await expect(palette.getByRole("option")).toHaveText([
		/Get User Information/,
	]);

	await page.keyboard.type("zzz");
	await expect(palette.getByText("No results found.")).toBeVisible();
});

test("a keyboard-only pass reaches every result and dismisses the palette", async ({
	admin,
	page,
}) => {
	await admin.visitAdminPage("options-general.php");
	await page.keyboard.press(`${modifier}+j`);

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	const options = palette.getByRole("option");
	await expect(options.first()).toHaveAttribute("aria-selected", "true");

	await page.keyboard.press("ArrowDown");
	await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");

	// `loop` on the palette, so the last result wraps back to the first.
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowUp");
	await expect(options.last()).toHaveAttribute("aria-selected", "true");

	await page.keyboard.press("Escape");
	await expect(palette).toBeHidden();
});

test("the admin bar item opens the palette", async ({ admin, page }) => {
	await admin.visitAdminPage("plugins.php");

	await page.locator("#wp-admin-bar-wpcp-tools-palette a").click();

	await expect(
		page.getByRole("dialog", { name: "Ability palette" }),
	).toBeVisible();
});

test("Cmd+K still belongs to core's palette", async ({ admin, page }) => {
	await admin.visitAdminPage("plugins.php");

	await page.keyboard.press(`${modifier}+k`);

	await expect(
		page.getByRole("dialog", { name: "Command palette" }),
	).toBeVisible();
	await expect(
		page.getByRole("dialog", { name: "Ability palette" }),
	).toBeHidden();
});

test("computed results answer the search itself", async ({ admin, page }) => {
	await admin.visitAdminPage("plugins.php");
	await page.keyboard.press(`${modifier}+j`);
	await page.keyboard.type("2+2");

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	// The answer to what was typed outranks the catalogue.
	await expect(palette.getByRole("option").first()).toHaveText("2+2 = 4");

	await palette.getByRole("option", { name: "2+2 = 4" }).click();
	await expect(palette).toBeHidden();
	// Nothing outside the editor renders the notices store.
	await expect(page.locator(".components-snackbar")).toContainText(
		"Copied to clipboard!",
	);
});

test("a tool that loads on demand still runs", async ({ admin, page }) => {
	await admin.visitAdminPage("plugins.php");
	await page.keyboard.press(`${modifier}+j`);
	await page.keyboard.type("confetti");

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette.getByRole("option", { name: "Confetti", exact: true }).click();

	// The canvas only exists if the async chunk resolved.
	await expect(page.locator("canvas")).toBeVisible();
});

test("an ability picked once comes back under Recent", async ({
	admin,
	page,
}) => {
	await admin.visitAdminPage("plugins.php");
	await page.keyboard.press(`${modifier}+j`);

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette.getByRole("option", { name: /Get User Information/ }).click();
	// Picking opens the ability's form, so the palette stays up.
	await expect(palette.getByRole("group", { name: "Fields" })).toBeVisible();

	await admin.visitAdminPage("options-general.php");
	await page.keyboard.press(`${modifier}+j`);

	await expect(palette.getByText("Recent")).toBeVisible();
	await expect(palette.getByRole("option").first()).toContainText(
		"Get User Information",
	);
});

test("picking an ability opens a form built from its input schema", async ({
	admin,
	page,
}) => {
	await admin.visitAdminPage("plugins.php");
	await page.keyboard.press(`${modifier}+j`);

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette.getByRole("option", { name: /Get Site Information/ }).click();

	await expect(
		palette.getByRole("heading", { name: "Get Site Information" }),
	).toBeVisible();
	// Core's only input is an array of the field names it will return.
	const fields = palette.getByRole("group", { name: "Fields" });
	await expect(fields.getByRole("checkbox")).toHaveCount(8);
	for (const name of ["name", "url", "wpurl", "admin_email", "version"]) {
		// "url" is a prefix of "wpurl", so a loose name matches two rows.
		await expect(
			fields.getByRole("checkbox", { name, exact: true }),
		).toBeVisible();
	}

	const language = fields.getByRole("checkbox", { name: "language" });
	await language.check();
	await expect(language).toBeChecked();
});

test("Escape steps back out of a form before it closes the palette", async ({
	admin,
	page,
}) => {
	await admin.visitAdminPage("options-general.php");
	await page.keyboard.press(`${modifier}+j`);

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette.getByRole("option", { name: /Get User Information/ }).click();
	await expect(palette.getByRole("group", { name: "Fields" })).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(palette.getByRole("option").first()).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(palette).toBeHidden();
});

test("a readonly ability runs without a confirm and shows what came back", async ({
	admin,
	page,
}) => {
	await admin.visitAdminPage("plugins.php");
	await page.keyboard.press(`${modifier}+j`);

	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette.getByRole("option", { name: /Get Site Information/ }).click();

	const fields = palette.getByRole("group", { name: "Fields" });
	await fields.getByRole("checkbox", { name: "url", exact: true }).check();

	await palette.getByRole("button", { name: "Run", exact: true }).click();

	// Readonly, so core answers this one on GET alone.
	await expect(palette.getByRole("heading", { name: "Result" })).toBeVisible();
	await expect(palette.getByText('"url"')).toBeVisible();
	await expect(palette.getByText(/127\.0\.0\.1/)).toBeVisible();
});
