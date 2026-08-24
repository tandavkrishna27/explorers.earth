import { describe, expect, it } from "vitest";
import {
  awaitProfileSaveTerminal,
  createDeferredProfileSave,
} from "../profileSave";

describe("profile save coordinator", () => {
  it("returns immediate terminal results unchanged", async () => {
    await expect(
      awaitProfileSaveTerminal({ status: "saved" }),
    ).resolves.toBe("saved");
    await expect(
      awaitProfileSaveTerminal({ status: "failed" }),
    ).resolves.toBe("failed");
  });

  it("waits for a deferred username decision", async () => {
    const deferred = createDeferredProfileSave();
    const terminal = awaitProfileSaveTerminal(deferred.result);

    deferred.settle("cancelled");

    await expect(terminal).resolves.toBe("cancelled");
  });

  it("settles a deferred save only once", async () => {
    const deferred = createDeferredProfileSave();

    deferred.settle("failed");
    deferred.settle("saved");

    await expect(deferred.result.completion).resolves.toBe("failed");
  });
});
