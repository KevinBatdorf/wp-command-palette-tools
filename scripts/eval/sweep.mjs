#!/usr/bin/env node
// The floor decides admission, so recall and false positives move together.
import { join } from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import { loadCases, loadCatalog, sweep } from "./score.mjs";

const HERE = import.meta.dirname;
const MODEL = process.argv[2] ?? "Xenova/all-MiniLM-L6-v2";

env.allowLocalModels = true;
env.allowRemoteModels = true;
env.localModelPath = join(HERE, "..", "..", "models/");
env.cacheDir = join(HERE, "..", "..", "models", ".cache");

const extractor = await pipeline("feature-extraction", MODEL, { dtype: "q8" });

await sweep({
	label: MODEL,
	catalog: loadCatalog(),
	cases: loadCases(),
	embed: async (texts) =>
		(await extractor(texts, { pooling: "mean", normalize: true })).tolist(),
});
