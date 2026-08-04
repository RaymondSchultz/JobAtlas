import { createApp } from "./app.js";
import { assertRuntimeConfig, config } from "./config.js";
import { pool } from "./db/pool.js";

assertRuntimeConfig();

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`JobAtlas backend listening on :${config.port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
