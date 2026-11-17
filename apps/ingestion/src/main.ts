import { fileURLToPath } from "node:url";
import { formatReport, runIngestion } from "./run-ingestion.js";

const outputDir = fileURLToPath(new URL("../output/", import.meta.url));

const report = await runIngestion({ fetch: globalThis.fetch, outputDir });
console.log(formatReport(report));

// Non-zero only when nothing could be fetched, so a scheduler can alert on it.
if (report.feeds.every((feed) => feed.status === "failed")) process.exitCode = 1;
