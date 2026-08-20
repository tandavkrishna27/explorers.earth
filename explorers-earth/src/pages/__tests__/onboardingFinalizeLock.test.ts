import { describe, it, expect } from "vitest";
import {
  createFinalizeLock,
  beginFinalize,
  endFinalize,
} from "../onboardingFinalizeLock";

describe("onboardingFinalizeLock (double-submit / duplicate-account guard)", () => {
  it("lets the first caller through", () => {
    const lock = createFinalizeLock();
    expect(beginFinalize(lock)).toBe(true);
  });

  it("blocks a concurrent second caller until the first releases (the double-click race)", () => {
    const lock = createFinalizeLock();
    // First click acquires and proceeds to create the account.
    expect(beginFinalize(lock)).toBe(true);
    // A second click (or programmatic re-invocation) arrives before the first
    // finishes — it must be rejected so no duplicate account is created.
    expect(beginFinalize(lock)).toBe(false);
    expect(beginFinalize(lock)).toBe(false);
    // First finalize completes (runs in the handler's finally).
    endFinalize(lock);
    // A later, legitimate finalize (e.g. after a failed first attempt) can run.
    expect(beginFinalize(lock)).toBe(true);
  });

  it("release is idempotent", () => {
    const lock = createFinalizeLock();
    beginFinalize(lock);
    endFinalize(lock);
    endFinalize(lock);
    expect(beginFinalize(lock)).toBe(true);
  });

  it("separate locks are independent", () => {
    const a = createFinalizeLock();
    const b = createFinalizeLock();
    expect(beginFinalize(a)).toBe(true);
    expect(beginFinalize(b)).toBe(true);
  });
});
