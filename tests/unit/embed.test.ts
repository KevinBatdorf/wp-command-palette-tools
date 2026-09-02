import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { MODEL, readWeights, vectorize } from "../../src/lib/embed.ts";
import { readVocabulary } from "../../src/lib/wordpiece.ts";

// The format scripts/model.mjs writes: magic, rows, dim, a scale per row, int8.
const pack = (scales: number[], quantized: number[][]) => {
	const dim = quantized[0].length;
	const buffer = new ArrayBuffer(16 + 4 * scales.length + scales.length * dim);
	const view = new DataView(buffer);

	for (const [i, code] of [..."WPCPEMB1"].entries()) {
		view.setUint8(i, code.charCodeAt(0));
	}
	view.setUint32(8, scales.length, true);
	view.setUint32(12, dim, true);
	for (const [row, scale] of scales.entries()) {
		view.setFloat32(16 + 4 * row, scale, true);
	}
	new Int8Array(buffer, 16 + 4 * scales.length).set(quantized.flat());

	return buffer;
};

// [PAD], [UNK], then one word, so "site" is row 2 and anything else is row 1.
const vocabulary = readVocabulary("[PAD]\n[UNK]\nsite\n");
const weights = readWeights(
	pack(
		[0.5, 1, 2],
		[
			[2, 0],
			[0, 4],
			[1, 1],
		],
	),
);

describe("readWeights", () => {
	it("reads the shape out of the header", () => {
		assert.equal(weights.rows, 3);
		assert.equal(weights.dim, 2);
	});

	it("views the buffer rather than copying it", () => {
		const buffer = pack([1], [[1, 1]]);
		assert.equal(readWeights(buffer).quantized.buffer, buffer);
	});

	it("refuses a buffer that is not a matrix", () => {
		assert.throws(
			() => readWeights(new TextEncoder().encode("<!DOCTYPE ").buffer),
			{
				message: /not an embedding matrix/,
			},
		);
	});
});

describe("vectorize", () => {
	it("scales a token's row by that row's own scale", () => {
		// Row 2 dequantizes to [2, 2], which normalises to equal parts.
		const [x, y] = vectorize(weights, vocabulary, "site");
		assert.ok(Math.abs(x - Math.SQRT1_2) < 1e-9, String(x));
		assert.equal(x, y);
	});

	it("means the rows before normalising, so repetition changes nothing", () => {
		assert.deepEqual(
			vectorize(weights, vocabulary, "site site"),
			vectorize(weights, vocabulary, "site"),
		);
	});

	it("embeds an unknown word as the unknown row", () => {
		assert.deepEqual(vectorize(weights, vocabulary, "zzz"), [0, 1]);
	});

	// A zero vector scores zero against everything.
	it("has no dimension to normalise for text that tokenizes to nothing", () => {
		assert.deepEqual(vectorize(weights, vocabulary, "   "), [0, 0]);
	});
});

describe("the pinned model", () => {
	it("is the one the build packed", () => {
		const lock = JSON.parse(
			readFileSync(
				join(import.meta.dirname, "../../scripts/assets.lock.json"),
				"utf8",
			),
		);

		assert.deepEqual(MODEL, { repo: lock.repo, revision: lock.revision });
	});
});
