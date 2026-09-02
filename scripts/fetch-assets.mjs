#!/usr/bin/env node
// Fetched at build time: these ship in the plugin zip but stay out of git.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

// A tag or `main` would let the weights change under the cached vectors.
const REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
const REPO = "Xenova/all-MiniLM-L6-v2";

const MODEL_FILES = [
	"config.json",
	"tokenizer.json",
	"tokenizer_config.json",
	"onnx/model_quantized.onnx",
];

// The .jsep build is WebGPU and 25MB; one short query never repays that.
const ORT_FILES = ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"];
const ORT_SRC = join(ROOT, "node_modules", "onnxruntime-web", "dist");

const digest = (buffer) =>
	createHash("sha256").update(buffer).digest("hex").slice(0, 16);

const write = async (path, buffer) => {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, buffer);
};

const cached = async (path) => {
	try {
		return await readFile(path);
	} catch {
		return null;
	}
};

const report = (file, bytes) =>
	console.log(`  ${file} — ${(bytes / 1048576).toFixed(2)}MB`);

const download = async (file) => {
	const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${file}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${url}: ${response.status} ${response.statusText}`);
	}

	return Buffer.from(await response.arrayBuffer());
};

const lock = {};

for (const file of MODEL_FILES) {
	const target = join(ROOT, "models", REPO, file);

	// Re-downloading 22MB every build would make `npm run build` unusable.
	const existing = await cached(target);
	const buffer = existing ?? (await download(file));
	if (!existing) await write(target, buffer);

	lock[file] = { bytes: buffer.byteLength, sha256: digest(buffer) };
	report(existing ? `${file} (cached)` : file, buffer.byteLength);
}

for (const file of ORT_FILES) {
	const buffer = await readFile(join(ORT_SRC, file));
	await write(join(ROOT, "ort", file), buffer);
	lock[file] = { bytes: buffer.byteLength, sha256: digest(buffer) };
	report(file, buffer.byteLength);
}

const total = Object.values(lock).reduce((sum, { bytes }) => sum + bytes, 0);
console.log(`Bundled assets: ${(total / 1048576).toFixed(1)}MB`);

// Committed, so a changed digest or byte count shows up as a diff in review.
await write(
	join(ROOT, "scripts", "assets.lock.json"),
	`${JSON.stringify({ repo: REPO, revision: REVISION, files: lock }, null, "\t")}\n`,
);
