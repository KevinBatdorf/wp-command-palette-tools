import type { Ability } from "./abilities.ts";
import { readVocabulary, tokenize, type Vocabulary } from "./wordpiece.ts";

const MAGIC = "WPCPEMB1";

// In the URL, or a model swap serves cached weights beside a new vocabulary.
export const MODEL = {
	repo: "minishlab/potion-base-8M",
	revision: "bf8b056651a2c21b8d2565580b8569da283cab23",
};

type Weights = {
	rows: number;
	dim: number;
	scales: Float32Array;
	quantized: Int8Array;
};

// Views into the fetched buffer, so 7MB of weights is never copied.
export const readWeights = (buffer: ArrayBuffer): Weights => {
	const head = new DataView(buffer);
	const magic = String.fromCharCode(...new Uint8Array(buffer, 0, MAGIC.length));
	if (magic !== MAGIC) throw new Error(`not an embedding matrix: ${magic}`);

	const rows = head.getUint32(8, true);
	const dim = head.getUint32(12, true);

	return {
		rows,
		dim,
		scales: new Float32Array(buffer, 16, rows),
		quantized: new Int8Array(buffer, 16 + 4 * rows, rows * dim),
	};
};

// No runtime: the model is one row per token, meaned and normalised.
export const vectorize = (
	{ dim, scales, quantized }: Weights,
	vocabulary: Vocabulary,
	text: string,
) => {
	const ids = tokenize(vocabulary, text);
	const vector = new Float64Array(dim);

	for (const id of ids) {
		const scale = scales[id] ?? 0;
		const base = id * dim;
		for (let d = 0; d < dim; d++) {
			vector[d] += (quantized[base + d] ?? 0) * scale;
		}
	}

	const count = ids.length || 1;
	let norm = 0;
	for (let d = 0; d < dim; d++) {
		vector[d] /= count;
		norm += vector[d] * vector[d];
	}

	return Array.from(vector, (value) => value / (Math.sqrt(norm) || 1));
};

type Model = { weights: Weights; vocabulary: Vocabulary };

const get = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url}: ${response.status}`);

	return response;
};

let model: Promise<Model> | null = null;

const load = () =>
	(model ??= (async () => {
		const at = (file: string) =>
			`${window.wpcpTools?.modelPath ?? ""}${MODEL.repo}/${file}?v=${MODEL.revision}`;

		const [matrix, vocabulary] = await Promise.all([
			get(at("embeddings.bin")).then((response) => response.arrayBuffer()),
			get(at("vocab.txt")).then((response) => response.text()),
		]);

		return {
			weights: readWeights(matrix),
			vocabulary: readVocabulary(vocabulary),
		};
		// Kept out of the cache on failure, so the next keystroke tries again.
	})().catch((error) => {
		model = null;
		throw error;
	}));

// The name tokenizes as punctuation, so only what a person wrote is embedded.
const describe = ({ label, description }: Ability) =>
	description ? `${label}. ${description}` : label;

export type Embedder = {
	ready: (abilities: Ability[], hash: string) => Promise<void>;
	similarity: (query: string) => Promise<(id: string) => number>;
};

const dot = (a: number[], b: number[]) =>
	a.reduce((sum, value, i) => sum + value * (b[i] ?? 0), 0);

export const createEmbedder = (): Embedder => {
	let vectors: Record<string, number[]> = {};
	// A lookup and a mean, so recomputing costs less than storing the result.
	let embedded: string | null = null;

	return {
		ready: async (abilities, hash) => {
			if (embedded === hash) return;

			const { weights, vocabulary } = await load();
			vectors = Object.fromEntries(
				abilities.map((ability) => [
					ability.name,
					vectorize(weights, vocabulary, describe(ability)),
				]),
			);
			embedded = hash;
		},
		similarity: async (query) => {
			const { weights, vocabulary } = await load();
			const asked = vectorize(weights, vocabulary, query);

			return (id) => {
				const vector = vectors[id];
				return vector ? dot(asked, vector) : 0;
			};
		},
	};
};
