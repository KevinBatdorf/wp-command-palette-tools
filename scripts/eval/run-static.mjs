#!/usr/bin/env node
import { loadCases, loadCatalog, score } from "./score.mjs";
import { staticEmbedder } from "./static-embedder.mjs";

const { embed, label } = await staticEmbedder({
	repo: process.argv[2] ?? "minishlab/potion-base-8M",
});

await score({
	label,
	catalog: loadCatalog(process.argv[3] ?? "catalog.json"),
	cases: loadCases(),
	embed,
});
