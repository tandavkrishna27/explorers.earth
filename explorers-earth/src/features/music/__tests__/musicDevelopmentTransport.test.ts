import { describe, expect, it, vi } from "vitest";
import { createMusicDevelopmentFetch, resolveMusicDevelopmentProxyTarget, resolveMusicSocketTransport } from "../musicDevelopmentTransport";

describe("Music development transport", () => {
  it("preserves a finite no-cors POST body without turning it into a forbidden stream", async () => {
    let recorded: Request | undefined;
    const transport = createMusicDevelopmentFetch(async (input) => { recorded = input as Request; return new Response(); }, true, "https://music.localhost");
    await transport(new Request("https://music.localhost/api/events", { method: "POST", mode: "no-cors", body: "finite-body" }));
    expect(recorded!.mode).toBe("no-cors");
    expect(await recorded!.text()).toBe("finite-body");
  });
  it("retains streaming bodies for cors requests without changing mode", async () => {
    let recorded: Request | undefined;
    const transport = createMusicDevelopmentFetch(async (input) => { recorded = input as Request; return new Response(); }, true, "https://music.localhost");
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("stream-body")); controller.close(); } });
    await transport(new Request("https://music.localhost/api/events", { method: "POST", mode: "cors", body, duplex: "half" } as RequestInit));
    expect(recorded!.mode).toBe("cors");
    expect(await recorded!.text()).toBe("stream-body");
  });
  it("preserves keepalive request bodies, referrer policy and integrity", async () => {
    let recorded: Request | undefined;
    const transport = createMusicDevelopmentFetch(async (input) => {
      recorded = input as Request; return new Response(null, { status: 204 });
    }, true, "https://music.localhost");
    await transport(new Request("https://music.localhost/api/events", {
      method: "POST", body: "keepalive-body", headers: { Authorization: "Bearer test-only" }, keepalive: true, referrerPolicy: "no-referrer", integrity: "sha256-test", credentials: "include",
    }));
    expect(recorded!.keepalive).toBe(true);
    expect(recorded!.referrerPolicy).toBe("no-referrer");
    expect(recorded!.integrity).toBe("sha256-test");
    expect(recorded!.credentials).toBe("include");
    expect(recorded!.headers.get("Authorization")).toBe("Bearer test-only");
    expect(await recorded!.text()).toBe("keepalive-body");
  });
  it("preserves a POST Request and init overrides through the proxy", async () => {
    const controller = new AbortController();
    let recorded: Request | undefined;
    const transport = createMusicDevelopmentFetch(async (input, init) => {
      recorded = new Request(input instanceof Request ? input : new URL(String(input), window.location.origin), init);
      return new Response(null, { status: 204 });
    }, true, "https://music.localhost");
    await transport(new Request("https://music.localhost/api/music/test?q=1", {
      method: "POST", body: "payload", headers: { Authorization: "Bearer test-only" },
      credentials: "omit", signal: controller.signal, cache: "no-store", redirect: "error",
    }), { headers: { "X-Test": "override" } });
    expect(new URL(recorded!.url).pathname).toBe("/__localtunes/api/music/test");
    expect(recorded!.method).toBe("POST");
    expect(await recorded!.text()).toBe("payload");
    expect(recorded!.headers.get("X-Test")).toBe("override");
    expect(recorded!.credentials).toBe("omit");
    expect(recorded!.cache).toBe("no-store");
    expect(recorded!.redirect).toBe("error");
    controller.abort();
    expect(recorded!.signal.aborted).toBe(true);
  });
  it.each(["bad-url", "http://music.example", "https://user:pass@music.example", "https://music.example/path"])("rejects invalid configuration lazily: %s", async (origin) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const transport = createMusicDevelopmentFetch(fetcher, false, origin);
    await expect(transport("https://music.example/api", { headers: { Authorization: "Bearer test" } })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the same socket path for websocket and polling", () => {
    expect(resolveMusicSocketTransport({ development: true, musicOrigin: "https://music.localhost", browserOrigin: "http://localhost:5173" })).toEqual({ origin: "http://localhost:5173", path: "/__localtunes/ws" });
    expect(resolveMusicSocketTransport({ development: false, musicOrigin: "https://music.example", browserOrigin: "https://app.example" })).toEqual({ origin: "https://music.example", path: "/ws" });
  });
  it("allows explicit literal-loopback proxy targets only", () => {
    expect(resolveMusicDevelopmentProxyTarget("https://music.localhost", { enabled: true, target: "http://127.0.0.1:5000" })).toBe("http://127.0.0.1:5000");
    for (const target of ["http://localhost:5000", "http://10.0.0.1", "http://127.0.0.1/a", "http://x@127.0.0.1", "http://127.0.0.1/?x=1", "http://127.1", "http://2130706433", "http://127.0.0.1/a/.."]) {
      expect(() => resolveMusicDevelopmentProxyTarget("https://music.localhost", { enabled: true, target })).toThrow();
    }
    expect(() => resolveMusicDevelopmentProxyTarget("https://music.localhost", { enabled: false, target: "http://127.0.0.1:5000" })).toThrow();
  });
  it("derives the proxy target from the configured Music origin", () => {
    expect(resolveMusicDevelopmentProxyTarget("https://staging-tunes.example.test/api")).toBe("https://staging-tunes.example.test");
    expect(resolveMusicDevelopmentProxyTarget(undefined)).toBe("https://localtunes.earth");
    expect(() => resolveMusicDevelopmentProxyTarget("https://token@staging-tunes.example.test"))
      .toThrow("without embedded credentials");
  });

  it("rewrites only the configured HTTPS Music origin through the same-origin Vite proxy", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const transport = createMusicDevelopmentFetch(fetchImpl, true, "https://localtunes.earth");

    await transport("https://localtunes.earth/api/music/identity/ensure?fresh=1", { method: "POST" });

    expect(fetchImpl).toHaveBeenCalledWith("/__localtunes/api/music/identity/ensure?fresh=1", { method: "POST" });
  });

  it("leaves production requests on their HTTPS origin", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const transport = createMusicDevelopmentFetch(fetchImpl, false, "https://localtunes.earth");

    await transport("https://localtunes.earth/api/music/dashboard");

    expect(fetchImpl).toHaveBeenCalledWith("https://localtunes.earth/api/music/dashboard", undefined);
  });

  it.each([true, false])("refuses a different upstream origin (dev=%s)", async (development) => {
    const transport = createMusicDevelopmentFetch(vi.fn(), development, "https://localtunes.earth");
    await expect(transport("https://unexpected.example/api/music/dashboard")).rejects.toThrow("origin");
  });
});
