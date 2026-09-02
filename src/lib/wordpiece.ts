// Mirrors huggingface/tokenizers: the one JS tokenizer that does WordPiece
// pulls onnxruntime in behind it.

const UNKNOWN = "[UNK]";
const CONTINUING = "##";

// The tokenizer config's own `max_input_chars_per_word`.
const MAX_WORD = 100;

const OTHER = /\p{C}/u;
const SPACE = /\s/u;
// `is_bert_punc`: any Unicode punctuation, plus ASCII symbols like `$` and `+`.
const PUNCTUATION = /[\p{P}!-/:-@[-`{-~]/u;
const ACCENT = /\p{Mn}/gu;

// Tab, newline and return are whitespace to the normalizer, not control characters.
const BREAKS = "\t\n\r";

const isControl = (char: string) => !BREAKS.includes(char) && OTHER.test(char);
const isSpace = (char: string) => BREAKS.includes(char) || SPACE.test(char);

const CJK: readonly [number, number][] = [
	[0x4e00, 0x9fff],
	[0x3400, 0x4dbf],
	[0xf900, 0xfaff],
	[0x20000, 0x2a6df],
	[0x2a700, 0x2b73f],
	[0x2b740, 0x2b81f],
	[0x2b820, 0x2ceaf],
	[0x2f800, 0x2fa1f],
];

// Han script has no spaces, so each character is padded into its own word.
const isCjk = (char: string) => {
	const point = char.codePointAt(0) ?? 0;
	return CJK.some(([from, to]) => point >= from && point <= to);
};

const normalize = (text: string) =>
	[...text]
		.filter((char) => char !== "\0" && char !== "\ufffd" && !isControl(char))
		.map((char) => (isSpace(char) ? " " : char))
		.map((char) => (isCjk(char) ? ` ${char} ` : char))
		.join("")
		.normalize("NFD")
		.replace(ACCENT, "")
		.toLowerCase();

const split = (text: string) => {
	const words: string[] = [];
	let word = "";

	for (const char of text) {
		if (isSpace(char) || PUNCTUATION.test(char)) {
			if (word) words.push(word);
			word = "";
			if (!isSpace(char)) words.push(char);
			continue;
		}

		word += char;
	}

	if (word) words.push(word);
	return words;
};

export type Vocabulary = Map<string, number>;

export const readVocabulary = (file: string): Vocabulary => {
	const vocabulary: Vocabulary = new Map();
	file.split("\n").forEach((token, id) => {
		if (token) vocabulary.set(token, id);
	});

	return vocabulary;
};

// Longest match first, and one piece that misses makes the whole word unknown.
const pieces = (vocabulary: Vocabulary, word: string) => {
	const chars = [...word];
	const ids: number[] = [];

	for (let start = 0; start < chars.length; ) {
		let end = chars.length;
		let id: number | undefined;

		while (end > start) {
			const piece = start
				? CONTINUING + chars.slice(start, end).join("")
				: chars.slice(start, end).join("");

			id = vocabulary.get(piece);
			if (id !== undefined) break;
			end--;
		}

		if (id === undefined) return null;
		ids.push(id);
		start = end;
	}

	return ids;
};

// No [CLS] or [SEP]: pooling the sentence markers only adds noise.
export const tokenize = (vocabulary: Vocabulary, text: string) => {
	const unknown = vocabulary.get(UNKNOWN);
	const ids: number[] = [];

	for (const word of split(normalize(text))) {
		const found = [...word].length > MAX_WORD ? null : pieces(vocabulary, word);
		if (found) ids.push(...found);
		else if (unknown !== undefined) ids.push(unknown);
	}

	return ids;
};
