import { describe, expect, it, vi, beforeEach } from "vitest";

const api = vi.hoisted(() => ({ getMyEditableRecommendation: vi.fn(), importMovieMedia: vi.fn() }));
const toast = vi.hoisted(() => ({ info: vi.fn() }));
const invalidateMovies = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/explorersApiClient", () => ({ explorersApiClient: api }));
vi.mock("sonner", () => ({ toast }));
vi.mock("../explorersAdapter", () => ({ invalidateMovies }));
import { startMovieImport } from "../backgroundMovieImport";

describe("startMovieImport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("observes once, imports once, refreshes once; no second GET", async () => {
    api.getMyEditableRecommendation.mockResolvedValue({ id: "r1", revision: 2 });
    api.importMovieMedia.mockResolvedValue({ slots: [{ status: "copied" }] });
    await startMovieImport("r1", "key-1").done;
    expect(api.getMyEditableRecommendation).toHaveBeenCalledTimes(1);
    expect(api.importMovieMedia).toHaveBeenCalledWith({ id: "r1", revision: 2 }, "key-1", expect.any(AbortSignal));
    expect(invalidateMovies).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("finishes after the caller has moved on", async () => {
    let resolve!: (v: unknown) => void;
    api.getMyEditableRecommendation.mockResolvedValue({ id: "r1", revision: 2 });
    api.importMovieMedia.mockReturnValue(new Promise((r) => { resolve = r; }));
    const run = startMovieImport("r1", "k");
    await Promise.resolve();
    expect(invalidateMovies).not.toHaveBeenCalled();
    resolve({ slots: [] });
    await run.done;
    expect(invalidateMovies).toHaveBeenCalledTimes(1);
  });

  it("failure keeps the original images and says so once", async () => {
    api.getMyEditableRecommendation.mockResolvedValue({ id: "r1", revision: 2 });
    api.importMovieMedia.mockRejectedValue(new Error("409"));
    await startMovieImport("r1", "k").done;
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith("Movie saved. Provider image copying is unavailable; original images remain.");
    expect(invalidateMovies).toHaveBeenCalledTimes(1);
  });

  it("reports partially unavailable slots", async () => {
    api.getMyEditableRecommendation.mockResolvedValue({ id: "r1", revision: 2 });
    api.importMovieMedia.mockResolvedValue({ slots: [{ status: "unavailable" }] });
    await startMovieImport("r1", "k").done;
    expect(toast.info).toHaveBeenCalledWith("Saved. Some provider images could not be copied.");
  });
});
