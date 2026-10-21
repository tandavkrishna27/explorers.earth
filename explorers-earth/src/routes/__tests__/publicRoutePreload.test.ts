import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_TAB_PRELOADERS, preloadPublicTabs } from "../publicRoutePreload";

describe("preloadPublicTabs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("covers every top-level public tab id the nav can pin", () => {
    expect(Object.keys(PUBLIC_TAB_PRELOADERS).sort()).toEqual([
      "public_apps", "public_books", "public_games", "public_guides", "public_movie",
      "public_people", "public_products", "public_profile", "public_recommendations",
    ]);
  });

  it("starts only the requested tab imports and ignores unknown ids", () => {
    const loaders = Object.fromEntries(Object.keys(PUBLIC_TAB_PRELOADERS)
      .map(id => [id, vi.spyOn(PUBLIC_TAB_PRELOADERS, id).mockResolvedValue({})]));
    preloadPublicTabs(["public_books", "public_unknown"]);
    expect(loaders.public_books).toHaveBeenCalledTimes(1);
    expect(Object.entries(loaders).filter(([id]) => id !== "public_books").every(([, spy]) => !spy.mock.calls.length)).toBe(true);
  });

  it("swallows a failed preload so the real navigation reports it", async () => {
    vi.spyOn(PUBLIC_TAB_PRELOADERS, "public_games").mockRejectedValue(new Error("chunk failed"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    preloadPublicTabs(["public_games"]);
    await new Promise(resolve => setTimeout(resolve, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("does nothing on data-saver connections", () => {
    const spy = vi.spyOn(PUBLIC_TAB_PRELOADERS, "public_books").mockResolvedValue({});
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    try {
      preloadPublicTabs(["public_books"]);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      delete (navigator as unknown as { connection?: unknown }).connection;
    }
  });
});
