#!/usr/bin/env node
// Scores rankFused, not cosine, or the lexical gate and floor go unmeasured.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import { rankFused } from "../../src/lib/rank.ts";

const HERE = import.meta.dirname;
const MODEL = process.argv[2] ?? "Xenova/all-MiniLM-L6-v2";
const DTYPE = process.argv[3] ?? "q8";

env.allowLocalModels = true;
env.allowRemoteModels = true;
env.localModelPath = join(HERE, "..", "..", "models/");
env.cacheDir = join(HERE, "..", "..", "models", ".cache");

const read = (name) => JSON.parse(readFileSync(join(HERE, name), "utf8"));
const catalog = read("catalog.json");
const cases = read("queries.json");

// Mirrors what the palette passes, or the eval would score a different list.
const items = catalog.map(({ name, label, description }) => ({
	id: name,
	label,
	description,
	keywords: [name],
}));

const extractor = await pipeline("feature-extraction", MODEL, { dtype: DTYPE });
const embed = async (texts) =>
	(await extractor(texts, { pooling: "mean", normalize: true })).tolist();

const text = ({ label, description }) =>
	description ? `${label}. ${description}` : label;

const started = Date.now();
const vectors = await embed(catalog.map(text));
const catalogMs = Date.now() - started;

const asked = await embed(cases.map(({ query }) => query));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

const wanted = cases.filter(({ expect }) => expect);
const nonsense = cases.filter(({ expect }) => !expect);
let top1 = 0;
let top3 = 0;
let missing = 0;
let falsePositives = 0;
const notes = [];

for (const [i, { query, expect }] of cases.entries()) {
	const byId = new Map(catalog.map(({ name }, di) => [name, vectors[di]]));
	const similarity = (id) => {
		const vector = byId.get(id);
		return vector ? dot(asked[i], vector) : 0;
	};
	const ranked = rankFused(items, query, { similarity }).map(({ id }) => id);

	if (!expect) {
		if (ranked.length) {
			falsePositives++;
			notes.push(`  false positive  "${query}" -> ${ranked[0]}`);
		}
		continue;
	}

	const at = ranked.indexOf(expect);
	if (at === 0) top1++;
	if (at >= 0 && at < 3) top3++;
	if (at < 0) {
		missing++;
		notes.push(`  missed          "${query}" -> ${ranked[0] ?? "nothing"}`);
	} else if (at > 0) {
		notes.push(`  rank ${at + 1}          "${query}" -> ${ranked[0]}`);
	}
}

const pct = (n, of) => `${((100 * n) / of).toFixed(0)}%`;

console.log(`\n${MODEL} (${DTYPE})`);
console.log(
	`  top-1            ${top1}/${wanted.length}  ${pct(top1, wanted.length)}`,
);
console.log(
	`  top-3            ${top3}/${wanted.length}  ${pct(top3, wanted.length)}`,
);
console.log(`  never surfaced   ${missing}/${wanted.length}`);
console.log(
	`  false positives  ${falsePositives}/${nonsense.length} on queries with no answer`,
);
console.log(
	`  catalog embed    ${catalogMs}ms for ${catalog.length} abilities`,
);
if (notes.length) console.log(notes.join("\n"));
