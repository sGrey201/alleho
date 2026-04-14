import "dotenv/config";

process.on("uncaughtException", (err) => {
  console.error("[boot] uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[boot] unhandledRejection:", reason);
});

const startedAt = Date.now();
const heartbeat = setInterval(() => {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  console.log(`[boot] still loading… ${seconds}s`);
}, 2000);

try {
  console.log("[boot] start");
  // `index.ts` no longer static-imports `./vite` (heavy); only express/cookie-parser/logger.
  console.log("[boot] import server/index");
  await import("./index");
  console.log("[boot] server/index imported");
} finally {
  clearInterval(heartbeat);
}
