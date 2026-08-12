import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { expireJobs } from "../services/job-processor.js";
import { connectors, runnableConnectors } from "./connectors/index.js";
import { runSource } from "./runner.js";

/**
 * Manual/one-off ingestion, and the escape hatch if scheduling ever moves to an
 * external cron instead of the in-process one.
 *
 *   npm run ingest -- remotive     one source
 *   npm run ingest -- all          every connector with its credentials present
 *   npm run ingest -- expire       the stale-job sweep
 */
async function main() {
  const target = process.argv[2];

  if (!target) {
    console.error("Usage: npm run ingest -- <source|all|expire>");
    console.error(`Sources: ${connectors.map((connector) => connector.key).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (target === "expire") {
    const result = await expireJobs(config.expireAfterDays);
    console.log(`Expired ${result.expired} jobs not seen in ${config.expireAfterDays} days`);
    return;
  }

  const targets = target === "all" ? runnableConnectors().map((connector) => connector.key) : [target];
  const summaries = [];

  for (const key of targets) {
    summaries.push(await runSource(key));
  }

  console.table(summaries);

  // A failed run should fail the process so an external scheduler or CI notices.
  if (summaries.some((summary) => summary.status === "failed")) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
