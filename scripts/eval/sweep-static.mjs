#!/usr/bin/env node
import { loadCases, loadCatalog, sweep } from "./score.mjs";
import { staticEmbedder } from "./static-embedder.mjs";

const { embed, label } = await staticEmbedder({
	repo: process.argv[2] ?? "minishlab/potion-base-8M",
	int8: process.argv[3] === "int8",
});

await sweep({
	label,
	catalog: loadCatalog(process.argv[4] ?? "catalog.json"),
	cases: loadCases(),
	embed,
});
