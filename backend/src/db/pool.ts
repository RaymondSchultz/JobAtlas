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
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export type DbClient = pg.Pool | pg.PoolClient;


