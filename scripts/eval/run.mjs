#!/usr/bin/env node
import { join } from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import { loadCases, loadCatalog, score } from "./score.mjs";

const HERE = import.meta.dirname;
const MODEL = process.argv[2] ?? "Xenova/all-MiniLM-L6-v2";
const DTYPE = process.argv[3] ?? "q8";
const CATALOG = process.argv[4] ?? "catalog.json";

env.allowLocalModels = true;
env.allowRemoteModels = true;
env.localModelPath = join(HERE, "..", "..", "models/");
env.cacheDir = join(HERE, "..", "..", "models", ".cache");

const extractor = await pipeline("feature-extraction", MODEL, { dtype: DTYPE });

await score({
	label: `${MODEL} (${DTYPE})`,
	catalog: loadCatalog(CATALOG),
	cases: loadCases(),
	embed: async (texts) =>
		(await extractor(texts, { pooling: "mean", normalize: true })).tolist(),
});
