import { expect, test } from "@wordpress/e2e-test-utils-playwright";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ admin, page, requestUtils }) => {
	await requestUtils.login();
	await admin.visitAdminPage("options-general.php");
	await page.keyboard.press(`${modifier}+j`);
});

test("an ability that changes the site will not run until it is confirmed", async ({
	page,
}) => {
	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette.getByRole("option", { name: /Rename Test Site/ }).click();

	await palette.getByRole("textbox", { name: /Title/ }).fill("Renamed");
	await palette.getByRole("button", { name: "Run", exact: true }).click();

	await expect(
		palette.getByText("This ability makes changes to your site."),
	).toBeVisible();
	await expect(palette.getByRole("heading", { name: "Result" })).toBeHidden();

	await palette.getByRole("button", { name: "Cancel" }).click();
	await expect(
		palette.getByText("This ability makes changes to your site."),
	).toBeHidden();
	await expect(palette.getByRole("heading", { name: "Result" })).toBeHidden();

	await palette.getByRole("button", { name: "Run", exact: true }).click();
	await palette.getByRole("button", { name: "Yes, run it" }).click();

	// Neither readonly nor destructive, so this only arrives as a POST body.
	await expect(palette.getByText('"renamed": "Renamed"')).toBeVisible();
});

test("a destructive ability warns that it cannot be undone", async ({
	page,
}) => {
	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette.getByRole("option", { name: /Purge Test Cache/ }).click();

	await palette.getByRole("spinbutton", { name: /Id/ }).fill("7");
	await palette.getByRole("button", { name: "Run", exact: true }).click();

	await expect(
		palette.getByText(
			"This ability can delete data, and running it cannot be undone.",
		),
	).toBeVisible();

	await palette.getByRole("button", { name: "Run anyway" }).click();

	// Destructive and idempotent, so core answers this one on DELETE alone.
	// The 7 arrives as a number only because core coerced the query string.
	await expect(palette.getByText('"purged": 7')).toBeVisible();
});

test("a required field the form has not filled blocks the run", async ({
	page,
}) => {
	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette.getByRole("option", { name: /Rename Test Site/ }).click();

	const run = palette.getByRole("button", { name: "Run", exact: true });
	await expect(run).toBeDisabled();

	await palette.getByRole("textbox", { name: /Title/ }).fill("Named");
	await expect(run).toBeEnabled();
});

test("the palette shows the reason the site gave for refusing", async ({
	page,
}) => {
	const palette = page.getByRole("dialog", { name: "Ability palette" });
	await palette.getByRole("option", { name: /Fail Test Run/ }).click();

	await expect(palette.getByText("This ability takes no input.")).toBeVisible();
	await palette.getByRole("button", { name: "Run", exact: true }).click();

	await expect(
		palette.getByText("The test ability refused to run."),
	).toBeVisible();
	await expect(palette.getByRole("heading", { name: "Result" })).toBeHidden();
});
