console.log("=== JobAtlas Server Starting ===");
import { createApp } from "./app.js";
import { assertRuntimeConfig, config } from "./config.js";
import { pool } from "./db/pool.js";

assertRuntimeConfig();

const app = createApp();
const port = Number(process.env.PORT ?? 4000);

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`JobAtlas backend listening on 0.0.0.0:${port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
