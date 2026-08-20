import { describe, it, expect } from "vitest";
import { decideAccountAction } from "../onboardingAccountDecision";

describe("decideAccountAction (onboarding duplicate-account guard)", () => {
  it("uses the existing account when a doc id is known (never creates a second)", () => {
    expect(decideAccountAction("acc_123", true)).toBe("use");
    // Even if the lookup failed, a known id means use it.
    expect(decideAccountAction("acc_123", false)).toBe("use");
  });

  it("creates only when there is no account AND the lookup confirmed none exists", () => {
    expect(decideAccountAction(null, true)).toBe("create");
    expect(decideAccountAction(undefined, true)).toBe("create");
    expect(decideAccountAction("", true)).toBe("create");
  });

  it("aborts (does not create) when the lookup failed and no account is known", () => {
    // This is the regression: a swallowed lookup error must NOT lead to a
    // duplicate account being created.
    expect(decideAccountAction(null, false)).toBe("abort");
    expect(decideAccountAction(undefined, false)).toBe("abort");
  });
});
