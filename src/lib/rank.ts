// Lexical only: ranking has to work with no model on the page.

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

export const rank = <T extends Rankable>(
	items: T[],
	query: string,
	recents: readonly string[] = [],
) => {
	if (!words(query).length) return [...items];

	const recent = new Set(recents);
	const scored: { item: T; score: number }[] = [];
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

	return scored
		.sort(
			(a, b) =>
				b.score - a.score ||
				a.item.label.length - b.item.label.length ||
				a.item.label.localeCompare(b.item.label),
		)
		.map((entry) => entry.item);
};
