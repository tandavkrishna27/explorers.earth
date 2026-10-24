import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d }) }));
import PickedItemCard from "../PickedItemCard";

describe("PickedItemCard", () => {
  it("shows the confirmed item and Change", () => {
    const onChange = vi.fn();
    render(<PickedItemCard title="Chowpatty Beach" subtitle="Girgaon, Mumbai" onChange={onChange} />);
    expect(screen.getByRole("status")).toHaveTextContent("Chowpatty Beach");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(onChange).toHaveBeenCalled();
  });
  it("hides Change when locked (edit of a provider item)", () => {
    render(<PickedItemCard title="X" onChange={vi.fn()} locked />);
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
  });
});
