import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../../../test/englishI18n";
import { PublishNudge } from "../PublishNudge";

describe("PublishNudge", () => {
  it("renders nothing when closed", () => {
    render(<PublishNudge open={false} reason={null} kind="list" listName="Comfort movies" onPublish={vi.fn()} onNotNow={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("3rd-item copy for a list", () => {
    render(<PublishNudge open reason="reachedThree" kind="list" listName="Comfort movies" onPublish={vi.fn()} onNotNow={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Publish this list?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("\"Comfort movies\" has 3 items now. Publish it so anyone with the link can see it, and it shows on your profile.");
  });

  it("leaving copy for a guide", () => {
    render(<PublishNudge open reason="leaving" kind="guide" listName="Goa with friends" onPublish={vi.fn()} onNotNow={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Publish this guide?" });
    expect(dialog).toHaveTextContent("\"Goa with friends\" is still a draft, so only you can see it.");
  });

  it("Not now and Publish call their handlers", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    const onNotNow = vi.fn();
    render(<PublishNudge open reason="leaving" kind="list" listName="L" onPublish={onPublish} onNotNow={onNotNow} />);
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(onNotNow).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("Escape counts as Not now", async () => {
    const user = userEvent.setup();
    const onNotNow = vi.fn();
    render(<PublishNudge open reason="reachedThree" kind="list" listName="L" onPublish={vi.fn()} onNotNow={onNotNow} />);
    await user.keyboard("{Escape}");
    expect(onNotNow).toHaveBeenCalledTimes(1);
  });

  it("while busy both buttons are disabled and Escape does nothing", async () => {
    const user = userEvent.setup();
    const onNotNow = vi.fn();
    render(<PublishNudge open busy reason="reachedThree" kind="list" listName="L" onPublish={vi.fn()} onNotNow={onNotNow} />);
    expect(screen.getByRole("button", { name: "Not now" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onNotNow).not.toHaveBeenCalled();
  });

  it("clamps a 500-char name and keeps the full name in a tooltip", () => {
    const longName = "A".repeat(500);
    render(<PublishNudge open reason="leaving" kind="list" listName={longName} onPublish={vi.fn()} onNotNow={vi.fn()} />);
    const name = screen.getByTitle(longName);
    expect(name.className).toContain("line-clamp-2");
  });

  it("buttons are at least 44px", () => {
    render(<PublishNudge open reason="leaving" kind="list" listName="L" onPublish={vi.fn()} onNotNow={vi.fn()} />);
    for (const label of ["Not now", "Publish"]) {
      expect(screen.getByRole("button", { name: label }).className).toContain("min-h-[44px]");
    }
  });
});
