import { describe, expect, it } from "vitest";
import { englishT } from "../../../test/englishI18n";

const KEYS = [
  "dashboard.wp2.pill.buttonLabel",
  "dashboard.wp2.pill.comingSoon",
  "dashboard.wp2.pill.state.public",
  "dashboard.wp2.pill.state.hidden",
  "dashboard.wp2.pill.state.draft",
  "dashboard.wp2.pill.state.private",
  "dashboard.wp2.pill.explain.categoryPublic",
  "dashboard.wp2.pill.explain.categoryPublicGeneric",
  "dashboard.wp2.pill.explain.categoryHidden",
  "dashboard.wp2.pill.explain.listDraft",
  "dashboard.wp2.pill.explain.listPublic",
  "dashboard.wp2.pill.explain.listPrivate",
  "dashboard.wp2.pill.toast.public",
  "dashboard.wp2.pill.toast.hidden",
  "dashboard.wp2.pill.toast.draft",
  "dashboard.wp2.bottomAdd.newList",
  "dashboard.wp2.bottomAdd.newGuide",
  "dashboard.wp2.bottomAdd.addItem",
  "dashboard.wp2.bottomAdd.addToDay",
  "dashboard.wp2.nudge.title.list",
  "dashboard.wp2.nudge.title.guide",
  "dashboard.wp2.nudge.body.reachedThree",
  "dashboard.wp2.nudge.body.leaving",
  "dashboard.wp2.nudge.notNow",
  "dashboard.wp2.nudge.publish",
] as const;

describe("dashboard.wp2 i18n keys", () => {
  it.each(KEYS)("%s resolves to English text", (key) => {
    expect(englishT(key)).not.toBe(key);
  });

  it("interpolates the v5 strings exactly", () => {
    expect(englishT("dashboard.wp2.pill.explain.categoryPublic", { category: "Movies" })).toBe("Movies shows on your profile");
    expect(englishT("dashboard.wp2.pill.buttonLabel", { state: "Public" })).toBe("Visibility: Public");
    expect(englishT("dashboard.wp2.bottomAdd.addToDay", { day: 2 })).toBe("Add to Day 2");
    expect(englishT("dashboard.wp2.pill.explain.listPrivate")).toBe("Coming soon: only people you invite by email");
  });
});
