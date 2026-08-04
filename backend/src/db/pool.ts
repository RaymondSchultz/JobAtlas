import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

const needsSsl = config.nodeEnv === "production" || config.databaseUrl.includes("neon.tech") || config.databaseUrl.includes("sslmode=require");

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export type DbClient = pg.Pool | pg.PoolClient;

