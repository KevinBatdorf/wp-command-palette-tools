#!/usr/bin/env node
// Static embeddings are a token-vector lookup plus a mean, so no onnxruntime.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AutoTokenizer, env } from "@huggingface/transformers";
import { rankFused } from "../../src/lib/rank.ts";

const HERE = import.meta.dirname;
const REPO = process.argv[2] ?? "minishlab/potion-base-2M";
const CACHE = join(HERE, "..", "..", "models", ".cache");

env.allowRemoteModels = true;
env.cacheDir = CACHE;

const fetchCached = async (file) => {
	const target = join(CACHE, REPO.replace("/", "--"), file);
	try {
		return readFileSync(target);
	} catch {}

	const url = `https://huggingface.co/${REPO}/resolve/main/${file}`;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url}: ${response.status}`);

	const buffer = Buffer.from(await response.arrayBuffer());
	mkdirSync(join(CACHE, REPO.replace("/", "--")), { recursive: true });
	writeFileSync(target, buffer);
	return buffer;
};

const readSafetensors = (buffer) => {
	const headerLength = Number(buffer.readBigUInt64LE(0));
	const header = JSON.parse(buffer.subarray(8, 8 + headerLength).toString());
	const name = Object.keys(header).find((key) => key !== "__metadata__");
	const { dtype, shape, data_offsets } = header[name];
	if (dtype !== "F32") throw new Error(`unexpected dtype ${dtype}`);

	const start = 8 + headerLength + data_offsets[0];
	const end = 8 + headerLength + data_offsets[1];
	const bytes = buffer.subarray(start, end);
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

const loaded = readSafetensors(await fetchCached("model.safetensors"));
const int8 = process.argv[3] === "int8";
const weights = int8 ? quantize(loaded) : loaded;
const tokenizer = await AutoTokenizer.from_pretrained(REPO);
const special = new Set(tokenizer.all_special_ids ?? []);

const embed = (texts) =>
	texts.map((text) => {
		const ids = [...tokenizer.encode(text)].filter((id) => !special.has(id));
		const out = new Float64Array(weights.dim);
		for (const id of ids) {
			const base = id * weights.dim;
			for (let d = 0; d < weights.dim; d++) out[d] += weights.matrix[base + d];
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

const read = (name) => JSON.parse(readFileSync(join(HERE, name), "utf8"));
const catalog = read("catalog.json");
const cases = read("queries.json");

const items = catalog.map(({ name, label, description }) => ({
	id: name,
	label,
	description,
	keywords: [name],
}));

const text = ({ label, description }) =>
	description ? `${label}. ${description}` : label;

const vectors = embed(catalog.map(text));
const asked = embed(cases.map(({ query }) => query));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

const wanted = cases.filter(({ expect }) => expect);
const nonsense = cases.filter(({ expect }) => !expect);
let top1 = 0;
let top3 = 0;
let missing = 0;
let falsePositives = 0;
const notes = [];
const byId = new Map(catalog.map(({ name }, di) => [name, vectors[di]]));

for (const [i, { query, expect }] of cases.entries()) {
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
	}
}

const pct = (n, of) => `${((100 * n) / of).toFixed(0)}%`;
const bytes = (weights.rows * weights.dim * (int8 ? 1 : 4)) / 1048576;
console.log(
	`\n${REPO} (static ${weights.rows}x${weights.dim}, ${int8 ? "int8" : "fp32"}, ${bytes.toFixed(1)}MB of weights)`,
);
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
if (notes.length) console.log(notes.join("\n"));
