import { schedule, validate, type ScheduledTask } from "node-cron";
import { config } from "../config.js";
import { expireJobs } from "../services/job-processor.js";
import { connectors, missingEnv } from "./connectors/index.js";
import { runSource } from "./runner.js";

const tasks: ScheduledTask[] = [];

/**
 * Replaces the n8n schedule triggers. Every connector keeps the cadence its
 * old workflow used; the expiry sweep replaces `10-cleanup.json`.
 *
 * Overlap is handled by the advisory lock in `runSource`, so a slow run cannot
 * pile up behind the next tick.
 */
export function startScheduler() {
  if (!config.ingestionEnabled) {
    console.log("[ingest] scheduler disabled (set INGESTION_ENABLED=true to enable)");
    return;
  }

  for (const connector of connectors) {
    const absent = missingEnv(connector);
    if (absent.length > 0) {
      console.log(`[ingest] ${connector.key} not scheduled — missing env: ${absent.join(", ")}`);
      continue;
    }

    if (!validate(connector.cron)) {
      console.error(`[ingest] ${connector.key} not scheduled — invalid cron "${connector.cron}"`);
      continue;
    }

    tasks.push(
      schedule(connector.cron, () => {
        // runSource resolves with a failed summary rather than throwing, but an
        // unexpected throw here would otherwise be an unhandled rejection.
        void runSource(connector.key).catch((error) =>
          console.error(`[ingest:${connector.key}] unhandled scheduler error:`, error),
        );
      }),
    );
    console.log(`[ingest] scheduled ${connector.key} (${connector.cron})`);
  }

  tasks.push(
    schedule(config.expiryCron, () => {
      void expireJobs(config.expireAfterDays)
        .then((result) => console.log(`[ingest:expiry] expired ${result.expired} stale jobs`))
        .catch((error) => console.error("[ingest:expiry] failed:", error));
    }),
  );
  console.log(`[ingest] scheduled expiry sweep (${config.expiryCron}, older than ${config.expireAfterDays}d)`);
}

export function stopScheduler() {
  for (const task of tasks) {
    task.stop();
  }
  tasks.length = 0;
}
