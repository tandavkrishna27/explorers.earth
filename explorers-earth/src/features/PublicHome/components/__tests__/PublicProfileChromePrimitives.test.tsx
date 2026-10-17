import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicHeaderDescriptorProvider, usePublicHeaderDescriptor } from "../PublicHeaderDescriptorContext";
import { PublicProfileFixedHeader } from "../PublicProfileChromePrimitives";

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

function RichDescriptor() {
  const location = useLocation();
  usePublicHeaderDescriptor({
    navigationKey: location.key,
    title: "Alice's Creators",
    text: "Meet Alice's favorite creators",
    url: "https://explorers.earth/alice/people/creators?utm_source=qr",
    analyticsContext: "people-list-header",
    analyticsMetadata: { listId: "list-1", listName: "Creators", sector: "film" },
  });
  return null;
}

describe("PublicProfileFixedHeader", () => {
  const trackClick = vi.fn();
  const clipboard = vi.fn();

  function renderHeader({ rich = false }: { rich?: boolean } = {}) {
    return render(
      <MemoryRouter initialEntries={["/alice/people/creators?utm_source=qr&access=secret"]}>
        <PublicHeaderDescriptorProvider origin="https://explorers.earth" username="alice" profileName="Alice">
          {rich && <RichDescriptor />}
          <PublicProfileFixedHeader onTrackClick={trackClick} />
        </PublicHeaderDescriptorProvider>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard.mockResolvedValue(undefined) } });
  });

  it("copies the canonical current URL, confirms success, and tracks rich metadata once when native share is absent", async () => {
    renderHeader({ rich: true });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(clipboard).toHaveBeenCalledWith("https://explorers.earth/alice/people/creators?utm_source=qr"));
    expect(toastSuccess).toHaveBeenCalledOnce();
    expect(trackClick).toHaveBeenCalledOnce();
    expect(trackClick).toHaveBeenCalledWith("share-button", {
      context: "people-list-header",
      listId: "list-1",
      listName: "Creators",
      sector: "film",
    });
  });

  it("uses native share only and tracks one attempt when it resolves", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    renderHeader({ rich: true });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(share).toHaveBeenCalledWith({
      title: "Alice's Creators",
      text: "Meet Alice's favorite creators",
      url: "https://explorers.earth/alice/people/creators?utm_source=qr",
    }));
    expect(clipboard).not.toHaveBeenCalled();
    expect(trackClick).toHaveBeenCalledOnce();
  });

  it("shares the synchronous current fallback after a search-only navigation", async () => {
    function NavigateSearch() {
      const navigate = useNavigate();
      return <button onClick={() => navigate("/alice/people/creators?utm_content=current&token=private")}>update search</button>;
    }
    render(
      <MemoryRouter initialEntries={["/alice/people/creators?utm_content=old"]}>
        <PublicHeaderDescriptorProvider origin="https://explorers.earth" username="alice" profileName="Alice">
          <NavigateSearch />
          <PublicProfileFixedHeader onTrackClick={trackClick} />
        </PublicHeaderDescriptorProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "update search" }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledWith("https://explorers.earth/alice/people/creators?utm_content=current"));
    expect(trackClick).toHaveBeenCalledOnce();
  });

  it("keeps AbortError cancellation quiet, never copies, and still tracks one attempt", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(clipboard).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(trackClick).toHaveBeenCalledOnce();
  });

  it("never falls back to clipboard after another native rejection and does not throw through the route", async () => {
    const share = vi.fn().mockRejectedValue(new Error("native failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(consoleError).toHaveBeenCalledOnce());
    expect(clipboard).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(trackClick).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing", undefined],
    ["rejected", { writeText: vi.fn().mockRejectedValue(new Error("clipboard failed")) }],
  ])("safely handles %s clipboard without a false success toast", async (_name, clipboardValue) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboardValue });
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(trackClick).toHaveBeenCalledOnce());
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("keeps a small brand-icon home Link and a decorative icon-only Share control", () => {
    renderHeader();
    const home = screen.getByRole("link", { name: "Explorers.Earth home" });
    expect(home).toHaveAttribute("href", "/");
    expect(home.querySelector(".public-brand-icon")).toBeInTheDocument();
    expect(home.querySelector(".public-brand-wordmark")).not.toBeInTheDocument();

    const share = screen.getByRole("button", { name: "Share" });
    expect(share).toHaveTextContent("");
    expect(share.querySelector("[data-public-header-share-icon]")).toHaveAttribute("aria-hidden", "true");
  });
});
