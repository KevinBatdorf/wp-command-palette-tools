#!/usr/bin/env node
// `wordpiece.json` is the reference tokenizer's own output, so the test cannot
// agree with itself. transformers.js is a devDependency for that alone.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AutoTokenizer, env } from "@huggingface/transformers";
import { readWeights, vectorize } from "../../src/lib/embed.ts";
import { readVocabulary, tokenize } from "../../src/lib/wordpiece.ts";
import { embedText, loadCases, loadCatalog } from "./score.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(ROOT, path));

const { repo, revision } = JSON.parse(read("scripts/assets.lock.json"));
const model = join("models", repo);

const weights = readWeights(
	new Uint8Array(read(join(model, "embeddings.bin"))).buffer,
);
const vocabulary = readVocabulary(read(join(model, "vocab.txt")).toString());

// What the corpus cannot cover: the normalizer's own edges.
const EDGES = [
	"Café ĝarden — naïve résumé",
	"WP-CLI's wp_cache_flush() ?!",
	"删除所有草稿",
	"Übersetzung löschen",
	"emoji 🍕 in a query",
	"a".repeat(120),
	"  double  spaces\tand\ttabs\n",
	"MiXeD CaSe TeXt",
	"pre-existing hyphen-words",
	"1,234.56 USD",
	"",
];

const texts = [
	...loadCases().map(({ query }) => query),
	...loadCatalog().map(embedText),
	...EDGES,
];

env.allowRemoteModels = true;
env.cacheDir = join(ROOT, "models", ".cache");
const reference = await AutoTokenizer.from_pretrained(repo);

// [CLS] and [SEP] are the reference's own; [UNK] is a row like any other.
const encode = (text) => [...reference.encode(text)].slice(1, -1);

const cases = {};
const wrong = [];
for (const text of texts) {
	const want = encode(text);
	if (tokenize(vocabulary, text).join() !== want.join()) wrong.push(text);
	cases[text] = want;
}

if (wrong.length) {
	console.error(`${wrong.length} of ${texts.length} tokenize differently:`);
	for (const text of wrong.slice(0, 10)) {
		console.error(`  ${JSON.stringify(text)}`);
		console.error(`    reference ${cases[text].join()}`);
		console.error(`    ours      ${tokenize(vocabulary, text).join()}`);
	}
	process.exit(1);
}

// Only the rows the cases reach; a token nothing chose cannot change the match.
const used = new Set(Object.values(cases).flat());
const reached = [...vocabulary]
	.filter(([, id]) => used.has(id))
	.sort(([, a], [, b]) => a - b);

// One id changing should be one changed line, so ids go in as a string.
const section = (name, entries, value) => {
	const rows = entries.map(
		([key, of]) => `\t\t${JSON.stringify(key)}: ${value(of)}`,
	);

	return `\t"${name}": {\n${rows.join(",\n")}\n\t}`;
};

writeFileSync(
	join(ROOT, "tests/unit/fixtures/wordpiece.json"),
	`{\n${[
		`\t"tokenizer": ${JSON.stringify(repo)}`,
		`\t"revision": ${JSON.stringify(revision)}`,
		section("vocabulary", reached, (id) => id),
		section("cases", Object.entries(cases), (ids) =>
			JSON.stringify(ids.join(", ")),
		),
	].join(",\n")}\n}\n`,
);

// The catalog rank.test.ts ranks: close to what core and a plugin register.
const CATALOG = [
	{
		id: "core/get-site-info",
		label: "Get Site Information",
		description: "Returns site information configured in WordPress.",
	},
	{
		id: "core/get-user-info",
		label: "Get User Information",
		description: "Returns information about the current user.",
	},
	{
		id: "core/get-environment-info",
		label: "Get Environment Info",
		description: "Returns the PHP and WordPress versions of this site.",
	},
	{
		id: "woo/update-price",
		label: "Update product price",
		description: "Sets the price on a product in the store.",
	},
];

// The three the test scores a cosine against; the rest of it ranks lexically.
const QUERIES = [
	"make my shop items cheaper",
	"who am i logged in as",
	"pizza recipe",
];

const round = (value) => Math.round(value * 1000) / 1000;
const vectors = CATALOG.map((ability) =>
	vectorize(weights, vocabulary, embedText(ability)),
);

const similarities = QUERIES.map((query) => {
	const asked = vectorize(weights, vocabulary, query);
	const row = CATALOG.map(({ id }, i) => [
		id,
		round(asked.reduce((sum, value, d) => sum + value * vectors[i][d], 0)),
	]);

	return [query, Object.fromEntries(row)];
});

writeFileSync(
	join(ROOT, "tests/unit/fixtures/similarities.json"),
	`${JSON.stringify(
		{
			model: repo,
			revision,
			embedded: "embedText, in scripts/eval/score.mjs",
			catalog: CATALOG,
			similarities: Object.fromEntries(similarities),
		},
		null,
		"\t",
	)}\n`,
);

console.log(
	`${texts.length} tokenizations match the reference; ${QUERIES.length} similarity rows written`,
);
