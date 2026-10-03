import { selectApiMode } from "./apiMode";

async function main(): Promise<void> {
  process.env.NODE_ENV ??= "production";
  const dotenv = await import("dotenv");
  dotenv.default.config();
  const mode = selectApiMode(process.env);
  const { server, shutdown } = mode === "canonical"
    ? await import("./auth/canonicalStartup").then(async ({ startCanonicalServer }) => {
      const started = await startCanonicalServer(process.env);
      return { server: started.httpServer, shutdown: started.shutdown };
    })
    : await import("./config/music-startup").then(({ startMusicServer }) =>
      startMusicServer(process.env, { apiOnly: true }));
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
    void shutdown().then(() => { process.exitCode = 0; }, (error) => {
      console.error("API shutdown failed:", error);
      process.exitCode = 1;
    });
  });
  console.log(`API listening on ${JSON.stringify(server.address())}`);
}

if (process.env.NODE_ENV !== "test") void main().catch((error) => {
  console.error("Failed to start API:", error);
  process.exitCode = 1;
});
