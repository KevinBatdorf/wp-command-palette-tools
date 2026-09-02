export type Rankable = {
	id: string;
	label: string;
	description?: string;
	keywords?: string[];
};

const LABEL_WEIGHT = 3;
const KEYWORD_WEIGHT = 2;
const DESCRIPTION_WEIGHT = 1;

const EXACT = 1;
const FIELD_PREFIX = 0.9;
const WORD_EXACT = 0.8;
const WORD_PREFIX = 0.7;
const SUBSTRING = 0.35;

// Big enough to order two equal matches, too small to beat a better one.
const RECENT_BONUS = 0.25;

// Labels are translated, so a word break is any non-letter, not a space.
const words = (text: string) =>
	text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);

const quality = (field: string, term: string) => {
	const haystack = field.toLowerCase();
	if (!haystack) return 0;
	if (haystack === term) return EXACT;
	if (haystack.startsWith(term)) return FIELD_PREFIX;
	// A word break in `core/get-site-info` is punctuation, so \b would miss it.
	const parts = words(haystack);
	if (parts.includes(term)) return WORD_EXACT;
	if (parts.some((word) => word.startsWith(term))) return WORD_PREFIX;

	return haystack.includes(term) ? SUBSTRING : 0;
};

const termScore = (item: Rankable, term: string) =>
	Math.max(
		LABEL_WEIGHT * quality(item.label, term),
		KEYWORD_WEIGHT *
			Math.max(0, ...(item.keywords ?? []).map((k) => quality(k, term))),
		DESCRIPTION_WEIGHT * quality(item.description ?? "", term),
	);

// Averaged so a two-word query is comparable with a one-word one.
export const score = (item: Rankable, query: string) => {
	const terms = words(query);
	if (!terms.length) return 0;

	let total = 0;
	for (const term of terms) {
		// Every term has to land, so another word narrows and never widens.
		const best = termScore(item, term);
		if (!best) return 0;
		total += best;
	}

	return total / terms.length;
};

type Scored<T> = { item: T; score: number };

const ordered = <T extends Rankable>(scored: Scored<T>[]) =>
	scored
		.sort(
			(a, b) =>
				b.score - a.score ||
				a.item.label.length - b.item.label.length ||
				a.item.label.localeCompare(b.item.label),
		)
		.map((entry) => entry.item);

export const rank = <T extends Rankable>(
	items: T[],
	query: string,
	recents: readonly string[] = [],
) => {
	if (!words(query).length) return [...items];

	const recent = new Set(recents);
	const scored: Scored<T>[] = [];
	for (const item of items) {
		const base = score(item, query);
		// Added after the filter, so recency never rescues a non-match.
		if (base > 0) {
			scored.push({
				item,
				score: base + (recent.has(item.id) ? RECENT_BONUS : 0),
			});
		}
	}

	return ordered(scored);
};

export type Similarity = (id: string) => number;

const LEXICAL_MAX = LABEL_WEIGHT * EXACT;

// Lowest floor with no false positives; higher loses real matches.
const SEMANTIC_FLOOR = 0.2;

// Under half, so a label match always outranks a merely related description.
const SEMANTIC_SHARE = 0.3;

export const rankFused = <T extends Rankable>(
	items: T[],
	query: string,
	{
		recents = [],
		similarity,
		floor = SEMANTIC_FLOOR,
	}: {
		recents?: readonly string[];
		similarity?: Similarity;
		floor?: number;
	} = {},
) => {
	// Keystroke one and a model that never loaded both arrive with no vectors.
	if (!similarity) return rank(items, query, recents);
	if (!words(query).length) return [...items];

	const recent = new Set(recents);
	const scored: Scored<T>[] = [];
	for (const item of items) {
		const lexical = score(item, query) / LEXICAL_MAX;
		const semantic = similarity(item.id);
		// Lexical scores zero for a query sharing no word, so cosine must admit it.
		if (!lexical && semantic < floor) continue;

		const fused =
			(1 - SEMANTIC_SHARE) * lexical + SEMANTIC_SHARE * Math.max(0, semantic);
		scored.push({
			item,
			score: fused + (recent.has(item.id) ? RECENT_BONUS / LEXICAL_MAX : 0),
		});
	}

	return ordered(scored);
};
