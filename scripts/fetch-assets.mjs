#!/usr/bin/env node
// Fetched at build time: these ship in the plugin zip but stay out of git.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { checkTokenizer, download, embeddings } from "./model.mjs";

const ROOT = join(import.meta.dirname, "..");

// A tag or `main` would let the weights move under a floor measured on them.
const REVISION = "bf8b056651a2c21b8d2565580b8569da283cab23";
const REPO = "minishlab/potion-base-8M";

const digest = (buffer) =>
	createHash("sha256").update(buffer).digest("hex").slice(0, 16);

const write = async (path, buffer) => {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, buffer);
};

const report = (file, bytes) =>
	console.log(`  ${file} — ${(bytes / 1048576).toFixed(2)}MB`);

const source = async (file) => {
	const { buffer, cached } = await download(REPO, REVISION, file);
	report(cached ? `${file} (cached)` : file, buffer.byteLength);

	return buffer;
};

const [safetensors, vocabulary, tokenizer] = await Promise.all(
	["model.safetensors", "vocab.txt", "tokenizer.json"].map(source),
);

checkTokenizer(tokenizer.toString(), vocabulary.toString());

// tokenizer.json is 684KB of settings we hardcode, so only these two ship.
const shipped = {
	"embeddings.bin": embeddings(safetensors),
	"vocab.txt": vocabulary,
};

const lock = {};
for (const [file, buffer] of Object.entries(shipped)) {
	await write(join(ROOT, "models", REPO, file), buffer);
	lock[file] = { bytes: buffer.byteLength, sha256: digest(buffer) };
	report(file, buffer.byteLength);
}

const total = Object.values(lock).reduce((sum, { bytes }) => sum + bytes, 0);
console.log(`Bundled assets: ${(total / 1048576).toFixed(1)}MB`);

// Committed, so a changed digest or byte count shows up as a diff in review.
await write(
	join(ROOT, "scripts", "assets.lock.json"),
	`${JSON.stringify(
		{
			repo: REPO,
			revision: REVISION,
			source: { "model.safetensors": digest(safetensors) },
			files: lock,
		},
		null,
		"\t",
	)}\n`,
);
