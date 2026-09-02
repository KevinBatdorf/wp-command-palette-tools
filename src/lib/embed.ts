import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import type { Ability } from "./abilities";

const MODEL = "Xenova/all-MiniLM-L6-v2";

// The catalog hash cannot see a model change, so the key carries the revision.
const REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";

const DB_NAME = "command-palette-tools";
const STORE = "vectors";

type Vectors = Record<string, number[]>;

const request = <T>(source: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		source.onsuccess = () => resolve(source.result);
		source.onerror = () => reject(source.error);
	});

const openDb = () =>
	new Promise<IDBDatabase>((resolve, reject) => {
		const opening = indexedDB.open(DB_NAME, 1);
		opening.onupgradeneeded = () => opening.result.createObjectStore(STORE);
		opening.onsuccess = () => resolve(opening.result);
		opening.onerror = () => reject(opening.error);
	});

// Private windows refuse IndexedDB outright, and recomputing beats throwing.
const read = async (key: string) => {
	try {
		const db = await openDb();
		const store = db.transaction(STORE, "readonly").objectStore(STORE);
		return (await request<Vectors | undefined>(store.get(key))) ?? null;
	} catch {
		return null;
	}
};

const write = async (key: string, vectors: Vectors) => {
	try {
		const db = await openDb();
		const store = db.transaction(STORE, "readwrite").objectStore(STORE);
		await request(store.put(vectors, key));
	} catch {}
};

// The name tokenizes as punctuation, so only what a person wrote is embedded.
const text = ({ label, description }: Ability) =>
	description ? `${label}. ${description}` : label;

let pipe: Promise<FeatureExtractionPipeline> | null = null;

const extractor = () =>
	(pipe ??= (async () => {
		const { env, pipeline } = await import("@huggingface/transformers");
		const paths = window.wpcpTools;

		env.allowLocalModels = true;
		env.allowRemoteModels = false;
		env.localModelPath = paths?.modelPath ?? "";
		// Left unset it falls back to a CDN, which is the one thing w.org forbids.
		const wasm = env.backends.onnx.wasm;
		if (!wasm) throw new Error("onnxruntime exposes no wasm settings");

		wasm.wasmPaths = paths?.ortPath ?? "";

		return pipeline<"feature-extraction">("feature-extraction", MODEL, {
			dtype: "q8",
		});
	})());

const embed = async (texts: string[]) => {
	const pipeline = await extractor();
	const output = await pipeline(texts, { pooling: "mean", normalize: true });

	return output.tolist() as number[][];
};

const dot = (a: number[], b: number[]) =>
	a.reduce((sum, value, i) => sum + value * (b[i] ?? 0), 0);

export type Embedder = {
	ready: (abilities: Ability[], hash: string) => Promise<void>;
	similarity: (query: string) => Promise<(id: string) => number>;
};

export const createEmbedder = (): Embedder => {
	let vectors: Vectors = {};

	return {
		ready: async (abilities, hash) => {
			const key = `${MODEL}@${REVISION}/${hash}`;
			const cached = await read(key);
			if (cached) {
				vectors = cached;
				return;
			}

			const embedded = await embed(abilities.map(text));
			vectors = Object.fromEntries(
				abilities.map(({ name }, i) => [name, embedded[i] ?? []]),
			);
			await write(key, vectors);
		},
		similarity: async (query) => {
			const [asked] = await embed([query]);
			if (!asked) return () => 0;

			return (id) => {
				const vector = vectors[id];
				return vector ? dot(asked, vector) : 0;
			};
		},
	};
};
