import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { englishI18n } from "../../../../test/englishI18n";
import ListCard from "../ListCard";

const model = { id: "l1", title: "A very long list name that keeps going well past forty-seven characters", status: "draft" as const, itemCount: 3, pinnedCount: 1, covers: ["/a.jpg"] };
const handlers = () => ({ onOpen: vi.fn(), onSetStatus: vi.fn(), onMove: vi.fn(), grip: { onKeyDown: vi.fn(), onDragStart: vi.fn(), onDragOver: vi.fn(), onDrop: vi.fn(), onDragEnd: vi.fn() } });
const wrap = (ui: React.ReactElement) => render(<I18nextProvider i18n={englishI18n}>{ui}</I18nextProvider>);

describe("ListCard", () => {
  it("is one link-like button named by the list; no Open word", async () => {
    const h = handlers();
    wrap(<ListCard category="movies" list={model} {...h} />);
    await userEvent.click(screen.getByRole("link", { name: model.title }));
    expect(h.onOpen).toHaveBeenCalledWith("l1");
    expect(screen.queryByText(/^Open$/)).toBeNull();
  });
  it("never says No items yet beside a non-zero count, even without covers (UAT)", () => {
    wrap(<ListCard category="movies" list={{ ...model, itemCount: 1, covers: [] }} {...handlers()} />);
    expect(screen.getByText("1 movie")).toBeInTheDocument();
    expect(screen.queryByText("No items yet")).toBeNull();
  });
  it("shows No items yet only for an empty list", () => {
    wrap(<ListCard category="movies" list={{ ...model, itemCount: 0, covers: [] }} {...handlers()} />);
    expect(screen.getByText("No items yet")).toBeInTheDocument();
  });
  it("shows badge, count and pinned count", () => {
    wrap(<ListCard category="movies" list={model} {...handlers()} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("3 movies")).toBeInTheDocument();
    expect(screen.getByText("★ 1 pinned")).toBeInTheDocument();
  });
  it("desktop switch publishes without opening the card", async () => {
    const h = handlers();
    wrap(<ListCard category="movies" list={model} {...h} />);
    await userEvent.click(screen.getByRole("switch", { name: `Public: ${model.title}` }));
    expect(h.onSetStatus).toHaveBeenCalledWith("l1", "public");
    expect(h.onOpen).not.toHaveBeenCalled();
  });
  it("menu offers Draft/Public and move earlier/later", async () => {
    const h = handlers();
    wrap(<ListCard category="movies" list={{ ...model, status: "public" }} {...h} />);
    await userEvent.click(screen.getByRole("button", { name: `More actions for ${model.title}` }));
    await userEvent.click(screen.getByRole("menuitem", { name: /✎ Draft/ }));
    expect(h.onSetStatus).toHaveBeenCalledWith("l1", "draft");
    await userEvent.click(screen.getByRole("button", { name: `More actions for ${model.title}` }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move later" }));
    expect(h.onMove).toHaveBeenCalledWith("l1", 1);
    expect(h.onOpen).not.toHaveBeenCalled();
  });
  it("an empty list cannot be published", () => {
    wrap(<ListCard category="movies" list={{ ...model, itemCount: 0, pinnedCount: 0, covers: [] }} {...handlers()} />);
    expect(screen.getByRole("switch", { name: /Public:/ })).toBeDisabled();
    expect(screen.getByText("No items yet")).toBeInTheDocument();
  });
  it("grip carries the keyboard instructions", () => {
    wrap(<ListCard category="movies" list={model} {...handlers()} />);
    expect(screen.getByRole("button", { name: /Press Space to pick up/ })).toBeInTheDocument();
  });
});
