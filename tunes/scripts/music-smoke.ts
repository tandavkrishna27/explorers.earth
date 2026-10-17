const strapiHostPort = process.env.MUSIC_STRAPI_HOST_PORT ?? "51337";

const endpoints = [
  ["strapi health", `http://127.0.0.1:${strapiHostPort}/health`, "json"],
  ["strapi identity", `http://127.0.0.1:${strapiHostPort}/api/users/me`, "json"],
  ["strapi accounts", `http://127.0.0.1:${strapiHostPort}/api/accounts`, "json"],
  ["Tunes application Strapi/PostgreSQL readiness", "http://127.0.0.1:55000/api/music-fixture/readiness", "json"],
  ["Explorers application", "http://127.0.0.1:55173/", "html"],
  ["Explorers-to-Tunes application path", "http://127.0.0.1:55173/api/music-fixture/readiness", "json"],
] as const;

export {};

for (const [name, url, representation] of endpoints) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5_000),
    ...(name === "strapi identity" || name === "strapi accounts"
      ? { headers: { authorization: "Bearer fixture-read-only-token" } }
      : {}),
  });
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (representation === "html") {
    if (!contentType.startsWith("text/html") || !/<html[\s>]/i.test(await response.text())) throw new Error(`${name} returned invalid HTML`);
  } else {
    if (!contentType.includes("application/json")) throw new Error(`${name} did not return JSON`);
    const body = await response.json();
    if (!body || typeof body !== "object") throw new Error(`${name} returned invalid JSON`);
  }
}
