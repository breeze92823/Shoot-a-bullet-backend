import { listen } from "@colyseus/tools";

import app from "./app.config.js";
import { closeDb, connectDb } from "./db.js";
import { REPORT_EVERY_MS } from "./constants.js";
import { flushReports } from "./reporter.js";
import { installRoomReporter } from "./roomReporter.js";

// Player-progress persistence (src/db.ts) connects before the room accepts
// players; connectDb() itself never throws or hangs (degrades to "no persistence").
await connectDb();

// SIGTERM drain (Legion waits up to 10 min on deploy): Colyseus stops accepting joins and lets the
// rooms dispose; then a last score flush and the Mongo close.
app.onShutdown(async () => {
  await flushReports();
  await closeDb();
});

console.log(`[server] pod=${process.env.POD_NAME || "local"} channel=${process.env.BLOXITY_CHANNEL || "-"}`);

// Listens on PORT (or 2567).
await listen(app);

// Bloxity: hosted leaderboards (no-op without BLOXITY_REPORT_TOKEN) and Open Rooms (no-op outside Legion).
setInterval(() => void flushReports(), REPORT_EVERY_MS).unref();
installRoomReporter();
