// Scores rankFused, not cosine, or the lexical gate and floor go unmeasured.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rankFused } from "../../src/lib/rank.ts";

const HERE = import.meta.dirname;

// Measured in the browser: 40px rows in a 328px list at a 1280x720 viewport.
const ROWS = 7;

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

const median = (numbers) =>
	[...numbers].sort((a, b) => a - b)[numbers.length >> 1] ?? 0;

const targets = ({ expect }) => (Array.isArray(expect) ? expect : [expect]);

const vectorsFor = async ({ embed, catalog, cases }) => {
	const vectors = await embed(catalog.map(embedText));
	const asked = await embed(cases.map(({ query }) => query));

	return {
		byId: new Map(catalog.map(({ name }, i) => [name, vectors[i]])),
		asked,
	};
};

const rankAll = ({ items, cases, byId, asked, floor }) =>
	cases.map(({ query, expect, kind }, i) => {
		const similarity = (id) => {
			const vector = byId.get(id);
			return vector ? dot(asked[i], vector) : 0;
		};
		const ranked = rankFused(items, query, { similarity, floor }).map(
			({ id }) => id,
		);
		const at = expect
			? ranked.findIndex((id) => targets({ expect }).includes(id))
			: -1;

		return { query, expect, kind, shown: ranked.length, at, top: ranked[0] };
	});

export const sweep = async ({ label, embed, catalog, cases }) => {
	const items = toItems(catalog);
	const { byId, asked } = await vectorsFor({ embed, catalog, cases });

	console.log(`\n${label} — floor sweep   (${catalog.length} abilities)`);
	console.log("  floor   never found   in view   first row   false positives");
	for (const floor of [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4]) {
		const scored = rankAll({ items, cases, byId, asked, floor });
		const answerable = scored.filter(({ expect }) => expect);
		const found = answerable.filter(({ at }) => at >= 0);

		console.log(
			[
				`  ${floor.toFixed(2)}`,
				String(answerable.length - found.length).padStart(11),
				pct(
					found.filter(({ at }) => at < ROWS).length,
					answerable.length,
				).padStart(9),
				pct(
					found.filter(({ at }) => at === 0).length,
					answerable.length,
				).padStart(11),
				String(
					scored.filter(({ expect, shown }) => !expect && shown).length,
				).padStart(17),
			].join(""),
		);
	}
};

export const score = async ({ label, embed, catalog, cases }) => {
	const items = toItems(catalog);
	const { byId, asked } = await vectorsFor({ embed, catalog, cases });
	const scored = rankAll({ items, cases, byId, asked });

	const kinds = new Map();
	const notes = [];

	for (const { query, expect, kind, at, top } of scored) {
		const bucket = kinds.get(kind) ?? { n: 0, first: 0, inView: 0, missing: 0 };
		bucket.n++;
		kinds.set(kind, bucket);

		if (!expect) {
			if (top) {
				bucket.missing++;
				notes.push(`  ${kind} false positive  "${query}" -> ${top}`);
			}
			continue;
		}

		if (at === 0) bucket.first++;
		// Counted, not assumed: a filtered list is nearly always shorter than ROWS.
		if (at >= 0 && at < ROWS) bucket.inView++;
		if (at < 0) {
			bucket.missing++;
			notes.push(`  ${kind} never found  "${query}" -> ${top ?? "nothing"}`);
		}
	}

	const answerable = [...kinds].filter(([kind]) => kind !== "none");
	const total = answerable.reduce(
		(sum, [, b]) => ({
			n: sum.n + b.n,
			first: sum.first + b.first,
			inView: sum.inView + b.inView,
			missing: sum.missing + b.missing,
		}),
		{ n: 0, first: 0, inView: 0, missing: 0 },
	);

	const row = (name, b) =>
		[
			`  ${name.padEnd(11)}`,
			String(b.n).padStart(3),
			pct(b.inView, b.n).padStart(9),
			String(b.n - b.missing - b.inView).padStart(13),
			pct(b.first, b.n).padStart(11),
		].join("");

	const shown = scored.map(({ shown: n }) => n);
	console.log(`\n${label}   (${catalog.length} abilities in the catalog)`);
	console.log(
		`  ${shown.filter((n) => n > ROWS).length} of ${shown.length} queries return more than ${ROWS} rows` +
			`  (median ${median(shown)}, max ${Math.max(...shown)})`,
	);
	console.log("  kind         n   in view   below fold   first row");
	for (const [kind, b] of answerable) console.log(row(kind, b));
	console.log(row("ALL", total));
	console.log(`  never found  ${total.missing}/${total.n}`);

	const none = kinds.get("none");
	if (none) {
		console.log(
			`  false positives  ${none.missing}/${none.n} on queries with no answer`,
		);
	}
	if (notes.length) console.log(notes.join("\n"));

	return { kinds, total };
};
