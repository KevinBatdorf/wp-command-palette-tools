// Static embeddings are a token-vector lookup plus a mean, so no onnxruntime.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AutoTokenizer, env } from "@huggingface/transformers";

const CACHE = join(import.meta.dirname, "..", "..", "models", ".cache");

const fetchCached = async (repo, file) => {
	const dir = join(CACHE, repo.replace("/", "--"));
	const target = join(dir, file);
	try {
		return readFileSync(target);
	} catch {}

	const url = `https://huggingface.co/${repo}/resolve/main/${file}`;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url}: ${response.status}`);

	const buffer = Buffer.from(await response.arrayBuffer());
	mkdirSync(dir, { recursive: true });
	writeFileSync(target, buffer);
	return buffer;
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
	const out = new Float32Array(matrix.length);
	for (let r = 0; r < rows; r++) {
		const base = r * dim;
		let peak = 0;
		for (let d = 0; d < dim; d++) {
			peak = Math.max(peak, Math.abs(matrix[base + d]));
		}

		const scale = peak / 127 || 1;
		for (let d = 0; d < dim; d++) {
			out[base + d] = Math.round(matrix[base + d] / scale) * scale;
		}
	}

	return { matrix: out, rows, dim };
};

export const staticEmbedder = async ({ repo, int8 = false }) => {
	env.allowRemoteModels = true;
	env.cacheDir = CACHE;

	const loaded = readSafetensors(await fetchCached(repo, "model.safetensors"));
	const weights = int8 ? quantize(loaded) : loaded;
	const tokenizer = await AutoTokenizer.from_pretrained(repo);
	const special = new Set(tokenizer.all_special_ids ?? []);

	const embed = (texts) =>
		texts.map((text) => {
			const ids = [...tokenizer.encode(text)].filter((id) => !special.has(id));
			const out = new Float64Array(weights.dim);
			for (const id of ids) {
				const base = id * weights.dim;
				for (let d = 0; d < weights.dim; d++) {
					out[d] += weights.matrix[base + d];
				}
			}

			const scale = ids.length || 1;
			let norm = 0;
			for (let d = 0; d < weights.dim; d++) {
				out[d] /= scale;
				norm += out[d] * out[d];
			}
			norm = Math.sqrt(norm) || 1;

			return Array.from(out, (value) => value / norm);
		});

	const mb = ((weights.rows * weights.dim * (int8 ? 1 : 4)) / 1048576).toFixed(
		1,
	);

	return {
		embed,
		label: `${repo} (static ${weights.rows}x${weights.dim}, ${int8 ? "int8" : "fp32"}, ${mb}MB of weights)`,
	};
};
