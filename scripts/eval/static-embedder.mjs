// Packs and pools through the plugin's own code, so this scores the shipped bytes.
import { readWeights, vectorize } from "../../src/lib/embed.ts";
import { readVocabulary } from "../../src/lib/wordpiece.ts";
import { download, embeddings } from "../model.mjs";

const exact = (buffer) =>
	buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

export const staticEmbedder = async ({ repo, revision = "main" }) => {
	const [matrix, vocabulary] = await Promise.all(
		["model.safetensors", "vocab.txt"].map(
			async (file) => (await download(repo, revision, file)).buffer,
		),
	);

	const packed = embeddings(matrix);
	const weights = readWeights(exact(packed));
	const vocab = readVocabulary(vocabulary.toString());
	const mb = (packed.byteLength / 1048576).toFixed(1);

	return {
		embed: (texts) => texts.map((text) => vectorize(weights, vocab, text)),
		label: `${repo} (static ${weights.rows}x${weights.dim} int8, ${mb}MB packed)`,
	};
};
