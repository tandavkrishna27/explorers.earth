import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { englishI18n } from "../../../../test/englishI18n";
import TopPicksHero from "../TopPicksHero";

const picks = [
  { id: "p1", title: "Zindagi Na Milegi Dobara", subtitle: "2011 · Drama", imageUrl: "/z.jpg", listId: "l1", listTitle: "Comfort movies", pinned: true, pinnable: true },
  { id: "p2", title: "Chef", subtitle: null, imageUrl: null, listId: "l1", listTitle: "Comfort movies", pinned: true, pinnable: true },
];
const wrap = (ui: React.ReactElement) => render(<I18nextProvider i18n={englishI18n}>{ui}</I18nextProvider>);

describe("TopPicksHero", () => {
  it("picks: shows the first pick, its list, thumbs to switch, and opens the list", async () => {
    const onOpenPick = vi.fn();
    wrap(<TopPicksHero category="movies" state="picks" picks={picks} onOpenPick={onOpenPick} onManage={() => {}} />);
    expect(screen.getByRole("heading", { name: "Zindagi Na Milegi Dobara" })).toBeInTheDocument();
    expect(screen.getByText('From "Comfort movies"')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show Chef" }));
    expect(screen.getByRole("heading", { name: "Chef" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Chef" }));
    expect(onOpenPick).toHaveBeenCalledWith(picks[1]);
  });
  it("empty: item copy for item categories, list copy for places", () => {
    const { rerender } = wrap(<TopPicksHero category="books" state="empty" picks={[]} onOpenPick={() => {}} onManage={() => {}} />);
    expect(screen.getByText("Pin items to feature them here")).toBeInTheDocument();
    expect(screen.getByText("Tap the star on any book in your lists.")).toBeInTheDocument();
    rerender(<I18nextProvider i18n={englishI18n}><TopPicksHero category="places" state="empty" picks={[]} onOpenPick={() => {}} onManage={() => {}} /></I18nextProvider>);
    expect(screen.getByText("Pin a public list to feature it here.")).toBeInTheDocument();
  });
  it("first visit shows the explainer", () => {
    wrap(<TopPicksHero category="games" state="firstVisit" picks={[]} onOpenPick={() => {}} onManage={() => {}} />);
    expect(screen.getByText("Your best picks go here")).toBeInTheDocument();
  });
  it.each(["picks", "empty", "firstVisit"] as const)("Manage Top Picks is rendered in state %s", async (state) => {
    const onManage = vi.fn();
    wrap(<TopPicksHero category="movies" state={state} picks={state === "picks" ? picks : []} onOpenPick={() => {}} onManage={onManage} />);
    await userEvent.click(screen.getByRole("button", { name: /Manage Top Picks/ }));
    expect(onManage).toHaveBeenCalled();
  });
});
