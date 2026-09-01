import { expect, test } from "@wordpress/e2e-test-utils-playwright";
import { type Ability, runHref } from "../src/lib/abilities.ts";

const CATALOG = "/wp-abilities/v1/abilities";

test.beforeEach(async ({ requestUtils }) => {
	await requestUtils.login();
});

test("a stock site lists the abilities the catalog is built from", async ({
	requestUtils,
}) => {
	const abilities = await requestUtils.rest<Ability[]>({ path: CATALOG });

	expect(abilities.map(({ name }) => name)).toEqual(
		expect.arrayContaining([
			"core/get-site-info",
			"core/get-user-info",
			"core/get-environment-info",
		]),
	);

	for (const ability of abilities) {
		expect(ability.label).toBeTruthy();
		expect(ability.category).toBeTruthy();
		expect(ability.input_schema).toBeDefined();
		expect(ability.meta?.annotations).toBeDefined();
		expect(runHref(ability)).toContain(`${ability.name}/run`);
	}
});

// per_page=-1 walks pages by this header alone; losing it truncates at 100.
test("the listing advertises its next page", async ({ requestUtils }) => {
	const { rootURL, nonce } = await requestUtils.setupRest();

	const response = await requestUtils.request.fetch(
		`${rootURL}wp-abilities/v1/abilities?per_page=1`,
		{ headers: { "X-WP-Nonce": nonce } },
	);

	expect(response.headers().link).toContain('rel="next"');
});
