// Packs a model2vec repo into the int8 matrix the palette loads.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CACHE = join(ROOT, "models", ".cache");

export const MAGIC = "WPCPEMB1";

const write = async (path, buffer) => {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, buffer);
};

// 30MB of weights per build would make `npm run build` unusable.
export const download = async (repo, revision, file) => {
	const target = join(CACHE, repo, file);
	try {
		return { buffer: await readFile(target), cached: true };
	} catch {}

	const url = `https://huggingface.co/${repo}/resolve/${revision}/${file}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${url}: ${response.status} ${response.statusText}`);
	}

	const buffer = Buffer.from(await response.arrayBuffer());
	await write(target, buffer);
	return { buffer, cached: false };
};

const readSafetensors = (buffer) => {
	const headerLength = Number(buffer.readBigUInt64LE(0));
	const header = JSON.parse(buffer.subarray(8, 8 + headerLength).toString());
	const name = Object.keys(header).find((key) => key !== "__metadata__");
	const { dtype, shape, data_offsets } = header[name];
	if (dtype !== "F32") throw new Error(`unexpected dtype ${dtype}`);

	const bytes = buffer.subarray(
		8 + headerLength + data_offsets[0],
		8 + headerLength + data_offsets[1],
	);
	// subarray keeps the parent's byteOffset, which need not be 4-aligned.
	const matrix = new Float32Array(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
	);

	return { matrix, rows: shape[0], dim: shape[1] };
};

// Each row gets its own scale, so one outlier token cannot flatten the rest.
const quantize = ({ matrix, rows, dim }) => {
	const scales = new Float32Array(rows);
	const quantized = new Int8Array(rows * dim);

	for (let row = 0; row < rows; row++) {
		const base = row * dim;
		let peak = 0;
		for (let d = 0; d < dim; d++) {
			peak = Math.max(peak, Math.abs(matrix[base + d]));
		}

		const scale = peak / 127 || 1;
		scales[row] = scale;
		for (let d = 0; d < dim; d++) {
			quantized[base + d] = Math.round(matrix[base + d] / scale);
		}
	}

	return { rows, dim, scales, quantized };
};

const pack = ({ rows, dim, scales, quantized }) => {
	const head = Buffer.alloc(16);
	head.write(MAGIC, 0, "ascii");
	head.writeUInt32LE(rows, 8);
	head.writeUInt32LE(dim, 12);

	return Buffer.concat([
		head,
		Buffer.from(scales.buffer),
		Buffer.from(quantized.buffer),
	]);
};

export const embeddings = (safetensors) =>
	pack(quantize(readSafetensors(safetensors)));

// The tokenizer is hand-rolled, so these settings are assumptions, not reads.
export const checkTokenizer = (tokenizer, vocabulary) => {
	const { normalizer, pre_tokenizer, model } = JSON.parse(tokenizer);
	const expected = {
		"normalizer.type": [normalizer?.type, "BertNormalizer"],
		"normalizer.clean_text": [normalizer?.clean_text, true],
		"normalizer.handle_chinese_chars": [normalizer?.handle_chinese_chars, true],
		"normalizer.lowercase": [normalizer?.lowercase, true],
		// Left null it follows `lowercase`, which is how the tokenizer reads it.
		"normalizer.strip_accents": [normalizer?.strip_accents ?? null, null],
		"pre_tokenizer.type": [pre_tokenizer?.type, "BertPreTokenizer"],
		"model.type": [model?.type, "WordPiece"],
		"model.unk_token": [model?.unk_token, "[UNK]"],
		"model.continuing_subword_prefix": [model?.continuing_subword_prefix, "##"],
		"model.max_input_chars_per_word": [model?.max_input_chars_per_word, 100],
	};

	for (const [key, [found, want]] of Object.entries(expected)) {
		if (found !== want) {
			throw new Error(
				`${key} is ${JSON.stringify(found)}, expected ${JSON.stringify(want)}`,
			);
		}
	}

	// vocab.txt is what ships, so its line order has to be the id order.
	const lines = vocabulary.split("\n");
	for (const [token, id] of Object.entries(model.vocab)) {
		if (lines[id] !== token) {
			throw new Error(
				`vocab.txt line ${id} is ${JSON.stringify(lines[id])}, expected ${JSON.stringify(token)}`,
			);
		}
	}
};
