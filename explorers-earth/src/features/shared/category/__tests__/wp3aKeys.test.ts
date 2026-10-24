import { describe, expect, it } from "vitest";
import en from "../../../../i18n/resources/en.json";

const required = [
  "dashboard.wp3a.titles.movies", "dashboard.wp3a.newList", "dashboard.wp3a.newGuide",
  "dashboard.wp3a.topPicks.title", "dashboard.wp3a.topPicks.manage", "dashboard.wp3a.topPicks.empty.title",
  "dashboard.wp3a.topPicks.empty.body", "dashboard.wp3a.topPicks.firstVisit.title",
  "dashboard.wp3a.states.loadError", "dashboard.wp3a.states.retry", "dashboard.wp3a.states.refreshing",
  "dashboard.wp3a.states.firstList", "dashboard.wp3a.toasts.orderSaved", "dashboard.wp3a.card.public",
  "dashboard.wp3a.manager.save", "dashboard.wp3a.dialog.create", "dashboard.wp3a.pill.hidden",
];
const get = (path: string) => path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], en);

describe("dashboard.wp3a keys", () => {
  it.each(required)("%s exists and is non-empty", (key) => {
    expect(typeof get(key)).toBe("string");
    expect((get(key) as string).length).toBeGreaterThan(0);
  });
});
