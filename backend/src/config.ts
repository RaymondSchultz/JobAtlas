import dotenv from "dotenv";

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-secret",
  internalServiceKey: process.env.INTERNAL_SERVICE_KEY ?? "",
  meilisearchUrl: process.env.MEILISEARCH_URL ?? "",
  meiliMasterKey: process.env.MEILI_MASTER_KEY ?? "",
};

export function assertRuntimeConfig() {
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.internalServiceKey) missing.push("INTERNAL_SERVICE_KEY");
  if (config.nodeEnv === "production" && config.jwtSecret === "dev-only-secret") {
    missing.push("JWT_SECRET");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
}
