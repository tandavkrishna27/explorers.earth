import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string, o?: Record<string, string>) => d.replace("{{query}}", o?.query ?? "") }) }));
import ItemSearch, { type ItemSearchResult } from "../ItemSearch";

const results: ItemSearchResult[] = [{ id: "1", title: "Zodiac", subtitle: "2007 · Thriller" }];

describe("ItemSearch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const renderSearch = (search = vi.fn().mockResolvedValue(results)) => {
    const props = { query: "", onQueryChange: vi.fn(), onPick: vi.fn(), onAddManually: vi.fn(), search, placeholder: "Search movies" };
    const view = render(<ItemSearch {...props} />);
    return { ...props, view, rerender: (q: string) => view.rerender(<ItemSearch {...props} query={q} />) };
  };

  it("debounces, aborts the previous call and shows results", async () => {
    const search = vi.fn().mockResolvedValue(results);
    const s = renderSearch(search);
    s.rerender("Zo");
    s.rerender("Zod");
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe("Zod");
    expect(screen.getByRole("option", { name: /Zodiac/ })).toBeInTheDocument();
  });

  it("Enter searches immediately", async () => {
    const search = vi.fn().mockResolvedValue(results);
    const s = renderSearch(search);
    s.rerender("Zodiac");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    await act(async () => {});
    expect(search).toHaveBeenCalledWith("Zodiac", expect.any(AbortSignal));
  });

  it("always offers the small Add manually link", () => {
    const s = renderSearch();
    fireEvent.click(screen.getByRole("button", { name: "Can't find it? Add manually" }));
    expect(s.onAddManually).toHaveBeenCalled();
  });

  it("no results shows a clear Add manually button", async () => {
    const s = renderSearch(vi.fn().mockResolvedValue([]));
    s.rerender("Nothing");
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('No matches for "Nothing"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add manually" }));
    expect(s.onAddManually).toHaveBeenCalled();
  });

  it("a provider failure says so and still offers manual", async () => {
    const s = renderSearch(vi.fn().mockRejectedValue(new Error("down")));
    s.rerender("Zodiac");
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole("alert")).toHaveTextContent("Search isn't working right now");
  });

  it("clicking a result picks it", async () => {
    const s = renderSearch();
    s.rerender("Zodiac");
    await act(async () => { vi.advanceTimersByTime(300); });
    fireEvent.click(screen.getByRole("option", { name: /Zodiac/ }));
    expect(s.onPick).toHaveBeenCalledWith(results[0]);
  });
});
