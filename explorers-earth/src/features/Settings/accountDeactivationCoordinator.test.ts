import { describe, expect, it, vi } from "vitest";
import { createDeletionCancellationCoordinator, deactivateExplorerAndMusic } from "./accountDeactivationCoordinator";

describe("cancelDeletionAndResumeMusic", () => {
  it("resumes Music before reporting deletion cancellation as complete", async () => {
    const events: string[] = [];
    const cancelled = { operation: { status: "suspended" } };
    const coordinator = createDeletionCancellationCoordinator({
      cancelDeletion: vi.fn(async () => { events.push("deletion-cancelled"); return cancelled; }),
      resumeMusic: vi.fn(async () => { events.push("music-reactivated"); }),
    });
    await expect(coordinator.cancelAndResume()).resolves.toBe(cancelled);
    expect(events).toEqual(["deletion-cancelled", "music-reactivated"]);
  });

  it("retries only Music reactivation after deletion cancellation already committed", async () => {
    const cancelled = { operation: { status: "suspended" } };
    const cancelDeletion = vi.fn(async () => cancelled);
    const resumeMusic = vi.fn()
      .mockRejectedValueOnce(new Error("Music temporarily unavailable"))
      .mockResolvedValueOnce(undefined);
    const coordinator = createDeletionCancellationCoordinator({ cancelDeletion, resumeMusic });
    await expect(coordinator.cancelAndResume()).rejects.toThrow("Music temporarily unavailable");
    await expect(coordinator.cancelAndResume()).resolves.toBe(cancelled);

    expect(cancelDeletion).toHaveBeenCalledTimes(1);
    expect(resumeMusic).toHaveBeenCalledTimes(2);
  });
});

describe("deactivateExplorerAndMusic", () => {
  it("does not block Explorer when Music suspension fails", async () => {
    const blockExplorer = vi.fn();
    await expect(deactivateExplorerAndMusic({
      blockExplorer,
      suspendMusic: vi.fn().mockRejectedValue(new Error("Music unavailable")),
      resumeMusic: vi.fn(),
    })).rejects.toThrow("Music unavailable");
    expect(blockExplorer).not.toHaveBeenCalled();
  });

  it("suspends Music before blocking Explorer", async () => {
    const events: string[] = [];
    await deactivateExplorerAndMusic({
      blockExplorer: vi.fn(async () => { events.push("explorer-blocked"); return true; }),
      suspendMusic: vi.fn(async () => { events.push("music-suspended"); }),
      resumeMusic: vi.fn(),
    });
    expect(events).toEqual(["music-suspended", "explorer-blocked"]);
  });

  it("reactivates Music when Explorer blocking is unconfirmed", async () => {
    const events: string[] = [];
    await expect(deactivateExplorerAndMusic({
      suspendMusic: vi.fn(async () => { events.push("music-suspended"); }),
      blockExplorer: vi.fn(async () => { events.push("explorer-unconfirmed"); return false; }),
      resumeMusic: vi.fn(async () => { events.push("music-reactivated"); }),
    })).rejects.toThrow("Explorer account status update was not confirmed");
    expect(events).toEqual(["music-suspended", "explorer-unconfirmed", "music-reactivated"]);
  });

  it("reactivates Music before propagating an Explorer blocking failure", async () => {
    const events: string[] = [];
    const failure = new Error("Explorer unavailable");
    await expect(deactivateExplorerAndMusic({
      suspendMusic: vi.fn(async () => { events.push("music-suspended"); }),
      blockExplorer: vi.fn(async () => { events.push("explorer-failed"); throw failure; }),
      resumeMusic: vi.fn(async () => { events.push("music-reactivated"); }),
    })).rejects.toBe(failure);
    expect(events).toEqual(["music-suspended", "explorer-failed", "music-reactivated"]);
  });
});
