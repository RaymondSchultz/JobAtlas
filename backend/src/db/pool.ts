import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

const rawUrl = config.databaseUrl;
// Remove sslmode from URL string so node-postgres uses the ssl configuration object cleanly
const cleanUrl = rawUrl.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
const needsSsl = config.nodeEnv === "production" || rawUrl.includes("neon.tech") || rawUrl.includes("sslmode");

export const pool = new Pool({
  connectionString: cleanUrl || rawUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 50,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 30_000,
});

/**
 * Without this listener the process exits.
 *
 * node-postgres emits 'error' on the pool when an *idle* connection drops, and
 * an unhandled 'error' event is fatal in Node. Neon's pooled endpoint closes
 * idle connections routinely, and the ingestion scheduler leaves the pool idle
 * between runs — so this reliably killed a long-running server hours after it
 * had otherwise been working fine.
 *
 * Logging is the correct response: the pool discards the broken client and
 * subsequent queries transparently open a new one. There is no in-flight query
 * to fail, which is precisely why nothing else surfaces the problem.
 */
pool.on("error", (error) => {
  console.error("Postgres pool error on idle client (connection will be replaced):", error);
});

export type DbClient = pg.Pool | pg.PoolClient;


