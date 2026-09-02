// Scores rankFused, not cosine, or the lexical gate and floor go unmeasured.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rankFused } from "../../src/lib/rank.ts";

const HERE = import.meta.dirname;

const read = (name) => JSON.parse(readFileSync(join(HERE, name), "utf8"));

export const loadCatalog = (name = "catalog.json") => read(name);
export const loadCases = () => read("queries.json");

// Mirrors what the palette passes, or the eval would score a different list.
const toItems = (catalog) =>
	catalog.map(({ name, label, description }) => ({
		id: name,
		label,
		description,
		keywords: [name],
	}));

export const embedText = ({ label, description }) =>
	description ? `${label}. ${description}` : label;

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

const pct = (n, of) => (of ? `${((100 * n) / of).toFixed(0)}%` : "—");

export const score = async ({ label, embed, catalog, cases }) => {
	const items = toItems(catalog);
	const vectors = await embed(catalog.map(embedText));
	const asked = await embed(cases.map(({ query }) => query));
	const byId = new Map(catalog.map(({ name }, i) => [name, vectors[i]]));

	const kinds = new Map();
	const notes = [];

	for (const [i, { query, expect, kind }] of cases.entries()) {
		const similarity = (id) => {
			const vector = byId.get(id);
			return vector ? dot(asked[i], vector) : 0;
		};
		const ranked = rankFused(items, query, { similarity }).map(({ id }) => id);

		const bucket = kinds.get(kind) ?? { n: 0, top1: 0, top3: 0, missing: 0 };
		bucket.n++;
		kinds.set(kind, bucket);

		if (!expect) {
			if (ranked.length) {
				bucket.missing++;
				notes.push(`  ${kind} false positive  "${query}" -> ${ranked[0]}`);
			}
			continue;
		}

		const wanted = Array.isArray(expect) ? expect : [expect];
		const at = ranked.findIndex((id) => wanted.includes(id));
		if (at === 0) bucket.top1++;
		if (at >= 0 && at < 3) bucket.top3++;
		if (at < 0) {
			bucket.missing++;
			notes.push(`  ${kind} missed  "${query}" -> ${ranked[0] ?? "nothing"}`);
		}
	}

	const answerable = [...kinds].filter(([kind]) => kind !== "none");
	const total = answerable.reduce(
		(sum, [, b]) => ({
			n: sum.n + b.n,
			top1: sum.top1 + b.top1,
			top3: sum.top3 + b.top3,
			missing: sum.missing + b.missing,
		}),
		{ n: 0, top1: 0, top3: 0, missing: 0 },
	);

	console.log(`\n${label}   (${catalog.length} abilities in the catalog)`);
	console.log("  kind         n   top-1   top-3   never surfaced");
	for (const [kind, b] of answerable) {
		console.log(
			`  ${kind.padEnd(11)}${String(b.n).padStart(3)}   ${pct(b.top1, b.n).padStart(5)}   ${pct(b.top3, b.n).padStart(5)}   ${b.missing}`,
		);
	}
	console.log(
		`  ${"ALL".padEnd(11)}${String(total.n).padStart(3)}   ${pct(total.top1, total.n).padStart(5)}   ${pct(total.top3, total.n).padStart(5)}   ${total.missing}`,
	);

	const none = kinds.get("none");
	if (none) {
		console.log(
			`  false positives  ${none.missing}/${none.n} on queries with no answer`,
		);
	}
	if (notes.length) console.log(notes.join("\n"));

	return { kinds, total };
};
