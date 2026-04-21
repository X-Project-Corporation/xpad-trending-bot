import "./health.js";
import { load } from "./store.js";
import { startFetcher } from "./fetcher.js";
import "./bot.js";

// Prevent crashes from unhandled errors
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (kept alive):", err.message);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection (kept alive):", err?.message || err);
});

// Load persisted store (alert configs)
load();
console.log("Store loaded");

// Start data fetcher (pulls all tokens every 60s)
startFetcher();
console.log("xpad Trending Bot is running");
