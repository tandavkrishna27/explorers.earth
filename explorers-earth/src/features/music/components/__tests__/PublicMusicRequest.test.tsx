import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { StrictMode } from 'react';
import { PublicMusicRequest } from "../PublicMusicRequest";
import { PublicMusicError } from "../../publicMusicClient";

const video = { id: { videoId: "abcdefghijk" }, snippet: { title: "Song", channelTitle: "Artist", thumbnails: { default: { url: "https://img.example/song.jpg" } } } };

describe("PublicMusicRequest", () => {
  it("ignores Enter while composing text and ignores invalid selected video IDs", async () => {
    const client = { search: vi.fn().mockResolvedValue({ items: [], nextPageToken: null }), videoFromUrl: vi.fn(), requestSong: vi.fn() };
    render(<PublicMusicRequest publicSlug="public-owner" allowed client={client} selection={{ youtubeId: "invalid", selectionId: 1 }} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "composed text" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", isComposing: true });
    expect(client.search).not.toHaveBeenCalled();
    expect(client.videoFromUrl).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await screen.findByText("No songs found.");
    expect(client.search).toHaveBeenCalledOnce();
  });
  it("renders result markup as literal text and replaces broken result artwork", async () => {
    const title = '<img src=x onerror=alert(1)>';
    const result = { ...video, snippet: { ...video.snippet, title } };
    const client = { search: vi.fn().mockResolvedValue({ items: [result], nextPageToken: null }), videoFromUrl: vi.fn(), requestSong: vi.fn() };
    const view = render(<PublicMusicRequest publicSlug="public-owner" allowed client={client} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "song" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("button", { name: "Request " + title + " by Artist" });
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(view.container.querySelectorAll("img")).toHaveLength(1);
    fireEvent.error(view.container.querySelector("img")!);
    expect(view.container.querySelector("img")).not.toBeInTheDocument();
    expect(client.requestSong).not.toHaveBeenCalled();
  });
  it("does not strand a manual search when a row selection is skipped during submission", async () => {
    let finishRequest!: (value: { accepted: true }) => void;
    let finishSearch!: (value: { items: typeof video[]; nextPageToken: null }) => void;
    const client = {
      videoFromUrl: vi.fn().mockResolvedValue(video),
      requestSong: vi.fn(() => new Promise<{ accepted: true }>(resolve => { finishRequest = resolve; })),
      search: vi.fn<(slug: string, query: string, cap?: string, signal?: AbortSignal) => Promise<{ items: typeof video[]; nextPageToken: null }>>(() => new Promise(resolve => { finishSearch = resolve; })),
    };
    const view = render(<PublicMusicRequest publicSlug="public-owner" allowed client={client} selection={{ youtubeId: "abcdefghijk", selectionId: 1 }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Request Song by Artist" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "another song" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const signal = client.search.mock.calls[0][3];
    view.rerender(<PublicMusicRequest publicSlug="public-owner" allowed client={client} selection={{ youtubeId: "lmnopqrstuv", selectionId: 2 }} />);
    await act(async () => { finishRequest({ accepted: true }); finishSearch({ items: [video], nextPageToken: null }); });
    expect(signal?.aborted).toBe(false);
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
    expect(client.videoFromUrl).toHaveBeenCalledTimes(1);
  });
  it('searches on Enter and exposes no invented remaining-request quota', async () => {
    const client = { search: vi.fn().mockResolvedValue({items: [video], nextPageToken: null}), videoFromUrl: vi.fn(), requestSong: vi.fn() };
    render(<PublicMusicRequest publicSlug="public-owner" allowed client={client} />);
    await userEvent.type(screen.getByRole('textbox'), 'song{Enter}');
    expect(await screen.findByRole('button', {name: 'Request Song by Artist'})).toBeInTheDocument();
    expect(client.search).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/requests left/i)).not.toBeInTheDocument();
  });
  it('resolves a chosen existing song and waits for explicit confirmation in StrictMode', async () => {
    const client = {search: vi.fn(), videoFromUrl: vi.fn().mockResolvedValue(video), requestSong: vi.fn().mockResolvedValue({accepted: true})};
    render(<StrictMode><PublicMusicRequest publicSlug="public-owner" allowed client={client} selection={{youtubeId: 'abcdefghijk', selectionId: 1}} /></StrictMode>);
    const confirm = await screen.findByRole('button', {name: 'Request Song by Artist'});
    expect(client.videoFromUrl).toHaveBeenLastCalledWith('public-owner', 'https://www.youtube.com/watch?v=abcdefghijk', undefined, expect.any(AbortSignal));
    expect(client.requestSong).not.toHaveBeenCalled();
    await userEvent.click(confirm);
    expect(client.requestSong).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('Song requested.');
  });
  it('does not replay a chosen row automatically after a rate-limit expires', async () => {
    vi.useFakeTimers();
    try {
      const client = {search: vi.fn().mockRejectedValue(new PublicMusicError('RATE_LIMITED', 2)), videoFromUrl: vi.fn(), requestSong: vi.fn()};
      const view = render(<PublicMusicRequest publicSlug="public-owner" allowed client={client} />);
      fireEvent.change(screen.getByRole('textbox'), {target: {value: 'song'}});
      fireEvent.click(screen.getByRole('button', {name: 'Search'}));
      await act(async () => {});
      view.rerender(<PublicMusicRequest publicSlug="public-owner" allowed client={client} selection={{youtubeId: 'abcdefghijk', selectionId: 1}} />);
      await act(async () => vi.advanceTimersByTime(3000));
      expect(client.videoFromUrl).not.toHaveBeenCalled();
      expect(client.requestSong).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it.each([
    [new PublicMusicError("REQUEST_INVALID"), "invalid"],
    [new PublicMusicError("RATE_LIMITED", 2), "rate_limited"],
    [new PublicMusicError("QUEUE_FULL"), "queue_full"],
    [new PublicMusicError("REQUEST_FORBIDDEN"), "forbidden"],
    [new PublicMusicError("PUBLIC_UNAVAILABLE"), "unavailable"],
  ] as const)("acknowledges a failed submission with only normalized reason %s", async (failure, expected) => {
    const onRequestOutcome = vi.fn();
    const client = { search: vi.fn().mockResolvedValue({ items: [video], nextPageToken: null }), videoFromUrl: vi.fn(), requestSong: vi.fn().mockRejectedValue(failure) };
    render(<PublicMusicRequest publicSlug="secret-public-slug" capability={"C".repeat(43)} allowed client={client as never} onRequestOutcome={onRequestOutcome} />);
    await userEvent.type(screen.getByLabelText("Search for a song or paste a YouTube URL"), "raw query");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("button", { name: "Request Song by Artist" }));
    await waitFor(() => expect(onRequestOutcome).toHaveBeenCalledWith(expected));
    expect(onRequestOutcome).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onRequestOutcome.mock.calls)).not.toMatch(/secret-public-slug|CCCCCCCC|raw query|youtube|http/i);
  });
  it("searches, presents an accessible result, and suppresses duplicate submissions", async () => {
    let resolve!: () => void;
    const requestSong = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const client = { search: vi.fn().mockResolvedValue({ items: [video], nextPageToken: null }), videoFromUrl: vi.fn(), requestSong };
    render(<PublicMusicRequest publicSlug="public_slug-123" allowed client={client as never} />);
    await userEvent.type(screen.getByLabelText("Search for a song or paste a YouTube URL"), "song");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("button", { name: "Request Song by Artist" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Request Song by Artist" }));
    await userEvent.click(screen.getByRole("button", { name: "Requesting Song by Artist" }));
    expect(requestSong).toHaveBeenCalledTimes(1);
    resolve();
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Song requested");
    await waitFor(() => expect(status).toHaveFocus());
  });

  it("aborts obsolete search and closes results when permission is revoked", async () => {
    const signals: AbortSignal[] = [];
    const client = { search: vi.fn((_slug, _query, _cap, signal) => { signals.push(signal); return new Promise(() => undefined); }), videoFromUrl: vi.fn(), requestSong: vi.fn() };
    const { rerender } = render(<PublicMusicRequest publicSlug="public_slug-123" allowed client={client as never} />);
    await userEvent.type(screen.getByLabelText("Search for a song or paste a YouTube URL"), "first");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    rerender(<PublicMusicRequest publicSlug="public_slug-123" allowed={false} client={client as never} />);
    await waitFor(() => expect(signals[0].aborted).toBe(true));
    expect(screen.queryByLabelText("Search for a song or paste a YouTube URL")).not.toBeInTheDocument();
  });

  it("aborts an in-flight search when the query changes and never renders its stale result", async () => {
    let resolve!: (value: { items: typeof video[]; nextPageToken: null }) => void;
    let signal!: AbortSignal;
    const client = { search: vi.fn((_slug, _query, _cap, currentSignal) => { signal = currentSignal; return new Promise((done) => { resolve = done; }); }), videoFromUrl: vi.fn(), requestSong: vi.fn() };
    render(<PublicMusicRequest publicSlug="public_slug-123" allowed client={client as never} />);
    const input = screen.getByLabelText("Search for a song or paste a YouTube URL");
    await userEvent.type(input, "old");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(input, " new");
    expect(signal.aborted).toBe(true);
    resolve({ items: [video], nextPageToken: null });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Request Song by Artist" })).not.toBeInTheDocument());
  });

  it("reports only normalized outcomes without query, capability, slug, or media URL", async () => {
    const onOutcome = vi.fn();
    const client = { search: vi.fn().mockResolvedValue({ items: [], nextPageToken: null }), videoFromUrl: vi.fn(), requestSong: vi.fn() };
    render(<PublicMusicRequest publicSlug="secret-public-slug" capability={"C".repeat(43)} allowed client={client as never} onOutcome={onOutcome} />);
    await userEvent.type(screen.getByLabelText("Search for a song or paste a YouTube URL"), "private query");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("No songs found.");
    expect(onOutcome).toHaveBeenCalledWith({ action: "search", outcome: "empty" });
    expect(JSON.stringify(onOutcome.mock.calls)).not.toMatch(/private query|secret-public-slug|CCCCCCCC|youtube|http/i);
  });

  it("has no automated accessibility violations in its instructional state", async () => {
    const client = { search: vi.fn(), videoFromUrl: vi.fn(), requestSong: vi.fn() };
    const { container } = render(<PublicMusicRequest publicSlug="public_slug-123" allowed client={client as never} />);
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("counts down a rate limit without enabling another search early", async () => {
    vi.useFakeTimers();
    try {
      const client = { search: vi.fn().mockRejectedValue(new PublicMusicError("RATE_LIMITED", 2)), videoFromUrl: vi.fn(), requestSong: vi.fn() };
      render(<PublicMusicRequest publicSlug="public_slug-123" allowed client={client as never} />);
      fireEvent.change(screen.getByLabelText("Search for a song or paste a YouTube URL"), { target: { value: "song" } });
      fireEvent.click(screen.getByRole("button", { name: "Search" }));
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByRole("button", { name: "Retry in 2s" })).toBeDisabled();
      act(() => vi.advanceTimersByTime(1_000));
      expect(screen.getByRole("button", { name: "Retry in 1s" })).toBeDisabled();
      act(() => vi.advanceTimersByTime(1_000));
      expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
    } finally { vi.useRealTimers(); }
  });

  it("counts down a request rate limit without enabling another request early", async () => {
    vi.useFakeTimers();
    try {
      const client = {
        search: vi.fn().mockResolvedValue({ items: [video], nextPageToken: null }),
        videoFromUrl: vi.fn(),
        requestSong: vi.fn().mockRejectedValue(new PublicMusicError("RATE_LIMITED", 2)),
      };
      render(<PublicMusicRequest publicSlug="public_slug-123" allowed client={client as never} />);
      fireEvent.change(screen.getByLabelText("Search for a song or paste a YouTube URL"), { target: { value: "song" } });
      fireEvent.click(screen.getByRole("button", { name: "Search" }));
      await act(async () => { await Promise.resolve(); });
      fireEvent.click(screen.getByRole("button", { name: "Request Song by Artist" }));
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByRole("button", { name: "Retry in 2 seconds: Song by Artist" })).toBeDisabled();
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(screen.getByRole("button", { name: "Request Song by Artist" })).toBeEnabled();
    } finally { vi.useRealTimers(); }
  });

  it("clears stale results and signals canonical reconciliation when submission is forbidden", async () => {
    const onCanonicalRevoked = vi.fn();
    const client = { search: vi.fn().mockResolvedValue({ items: [video], nextPageToken: null }), videoFromUrl: vi.fn(), requestSong: vi.fn().mockRejectedValue(new PublicMusicError("REQUEST_FORBIDDEN")) };
    render(<PublicMusicRequest publicSlug="public_slug-123" allowed client={client as never} onCanonicalRevoked={onCanonicalRevoked} />);
    await userEvent.type(screen.getByLabelText("Search for a song or paste a YouTube URL"), "song");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("button", { name: "Request Song by Artist" }));
    await waitFor(() => expect(onCanonicalRevoked).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("list", { name: "Song search results" })).not.toBeInTheDocument();
    expect(onCanonicalRevoked).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["song query", "search"],
    ["https://youtu.be/abcdefghijk", "videoFromUrl"],
  ] as const)("signals canonical reconciliation when lookup is revoked for %s", async (query, method) => {
    const onCanonicalRevoked = vi.fn();
    const client = { search: vi.fn().mockRejectedValue(new PublicMusicError("REQUEST_FORBIDDEN")), videoFromUrl: vi.fn().mockRejectedValue(new PublicMusicError("PUBLIC_NOT_FOUND")), requestSong: vi.fn() };
    render(<PublicMusicRequest publicSlug="public_slug-123" allowed client={client as never} onCanonicalRevoked={onCanonicalRevoked} />);
    await userEvent.type(screen.getByLabelText("Search for a song or paste a YouTube URL"), query);
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(onCanonicalRevoked).toHaveBeenCalledTimes(1));
    expect(client[method]).toHaveBeenCalledTimes(1);
  });

  it("suppresses an obsolete late completion after URL revocation and signals exactly once", async () => {
    let resolveOld!: (value: { items: typeof video[]; nextPageToken: null }) => void;
    const onCanonicalRevoked = vi.fn();
    const client = { search: vi.fn(() => new Promise((resolve) => { resolveOld = resolve; })), videoFromUrl: vi.fn().mockRejectedValue(new PublicMusicError("PUBLIC_NOT_FOUND")), requestSong: vi.fn() };
    render(<PublicMusicRequest publicSlug="public_slug-123" allowed client={client as never} onCanonicalRevoked={onCanonicalRevoked} />);
    const input = screen.getByLabelText("Search for a song or paste a YouTube URL");
    await userEvent.type(input, "old query");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.clear(input);
    await userEvent.type(input, "https://youtu.be/abcdefghijk");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(onCanonicalRevoked).toHaveBeenCalledTimes(1));
    resolveOld({ items: [video], nextPageToken: null });
    await waitFor(() => expect(screen.queryByRole("list", { name: "Song search results" })).not.toBeInTheDocument());
    expect(onCanonicalRevoked).toHaveBeenCalledTimes(1);
  });

  it.each(["search-first", "submit-first"] as const)("signals one canonical revocation for concurrent search and submit rejection (%s)", async (order) => {
    let rejectSearch!: (error: unknown) => void;
    let rejectSubmit!: (error: unknown) => void;
    const onCanonicalRevoked = vi.fn();
    const onOutcome = vi.fn();
    const search = vi.fn()
      .mockResolvedValueOnce({ items: [video], nextPageToken: null })
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectSearch = reject; }));
    const client = { search, videoFromUrl: vi.fn(), requestSong: vi.fn(() => new Promise((_, reject) => { rejectSubmit = reject; })) };
    render(<PublicMusicRequest publicSlug="public_slug-123" allowed client={client as never} onCanonicalRevoked={onCanonicalRevoked} onOutcome={onOutcome} />);
    const input = screen.getByLabelText("Search for a song or paste a YouTube URL");
    await userEvent.type(input, "first");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("button", { name: "Request Song by Artist" }));
    await userEvent.clear(input);
    await userEvent.type(input, "second");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    const first = order === "search-first" ? rejectSearch : rejectSubmit;
    const second = order === "search-first" ? rejectSubmit : rejectSearch;
    first(new PublicMusicError("REQUEST_FORBIDDEN"));
    await waitFor(() => expect(onCanonicalRevoked).toHaveBeenCalledTimes(1));
    second(new PublicMusicError("PUBLIC_NOT_FOUND"));
    await act(async () => { await Promise.resolve(); });
    expect(onCanonicalRevoked).toHaveBeenCalledTimes(1);
    expect(onOutcome.mock.calls.filter(([event]) => event?.outcome === "forbidden")).toHaveLength(0);
    expect(screen.queryByRole("list", { name: "Song search results" })).not.toBeInTheDocument();
  });

  it.each(["slug", "capability"] as const)("suppresses old pending search success and revocation across %s scope changes", async (dimension) => {
    let settle!: (value: { items: typeof video[]; nextPageToken: null }) => void;
    const onCanonicalRevoked = vi.fn();
    const onOutcome = vi.fn();
    const client = { search: vi.fn(() => new Promise((resolve) => { settle = resolve; })), videoFromUrl: vi.fn(), requestSong: vi.fn() };
    const first = { publicSlug: "public_slug-123", capability: dimension === "capability" ? "A".repeat(43) : undefined };
    const second = { publicSlug: dimension === "slug" ? "public_slug-456" : first.publicSlug, capability: dimension === "capability" ? "B".repeat(43) : undefined };
    const view = render(<PublicMusicRequest {...first} allowed client={client as never} onCanonicalRevoked={onCanonicalRevoked} onOutcome={onOutcome} />);
    await userEvent.type(screen.getByLabelText("Search for a song or paste a YouTube URL"), "old");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    view.rerender(<PublicMusicRequest {...second} allowed client={client as never} onCanonicalRevoked={onCanonicalRevoked} onOutcome={onOutcome} />);
    settle({ items: [video], nextPageToken: null });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("list", { name: "Song search results" })).not.toBeInTheDocument();
    expect(onOutcome).not.toHaveBeenCalled();
    expect(onCanonicalRevoked).not.toHaveBeenCalled();
  });

  it.each(["slug", "capability"] as const)("suppresses old pending submit revocation across %s scope changes while the new scope remains usable", async (dimension) => {
    let rejectSubmit!: (error: unknown) => void;
    const onCanonicalRevoked = vi.fn();
    const onOutcome = vi.fn();
    const client = { search: vi.fn().mockResolvedValue({ items: [video], nextPageToken: null }), videoFromUrl: vi.fn(), requestSong: vi.fn(() => new Promise((_, reject) => { rejectSubmit = reject; })) };
    const first = { publicSlug: "public_slug-123", capability: dimension === "capability" ? "A".repeat(43) : undefined };
    const second = { publicSlug: dimension === "slug" ? "public_slug-456" : first.publicSlug, capability: dimension === "capability" ? "B".repeat(43) : undefined };
    const view = render(<PublicMusicRequest {...first} allowed client={client as never} onCanonicalRevoked={onCanonicalRevoked} onOutcome={onOutcome} />);
    const input = screen.getByLabelText("Search for a song or paste a YouTube URL");
    await userEvent.type(input, "old");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("button", { name: "Request Song by Artist" }));
    view.rerender(<PublicMusicRequest {...second} allowed client={client as never} onCanonicalRevoked={onCanonicalRevoked} onOutcome={onOutcome} />);
    rejectSubmit(new PublicMusicError("REQUEST_FORBIDDEN"));
    await act(async () => { await Promise.resolve(); });
    expect(onCanonicalRevoked).not.toHaveBeenCalled();
    expect(onOutcome.mock.calls.filter(([event]) => event.outcome === "forbidden")).toHaveLength(0);
    await userEvent.clear(input);
    await userEvent.type(input, "new");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("button", { name: "Request Song by Artist" })).toBeEnabled();
  });

  it("emits no request analytics after unmount, including canonical revocation", async () => {
    let rejectSubmit!: (error: unknown) => void;
    const onRequestOutcome = vi.fn();
    const onCanonicalRevoked = vi.fn();
    const client = { search: vi.fn().mockResolvedValue({ items: [video], nextPageToken: null }), videoFromUrl: vi.fn(), requestSong: vi.fn(() => new Promise((_, reject) => { rejectSubmit = reject; })) };
    const view = render(<PublicMusicRequest publicSlug="public_slug-123" allowed client={client as never} onRequestOutcome={onRequestOutcome} onCanonicalRevoked={onCanonicalRevoked} />);
    await userEvent.type(screen.getByLabelText("Search for a song or paste a YouTube URL"), "song");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("button", { name: "Request Song by Artist" }));
    view.unmount();
    rejectSubmit(new PublicMusicError("REQUEST_FORBIDDEN"));
    await act(async () => { await Promise.resolve(); });
    expect(onRequestOutcome).not.toHaveBeenCalled();
    expect(onCanonicalRevoked).not.toHaveBeenCalled();
  });

  it("ignores an in-flight request result after live guest actions are revoked", async () => {
    let resolveSubmit!: () => void;
    const onOutcome = vi.fn();
    const onRequestOutcome = vi.fn();
    const client = {
      search: vi.fn().mockResolvedValue({ items: [video], nextPageToken: null }),
      videoFromUrl: vi.fn(),
      requestSong: vi.fn(() => new Promise<void>((resolve) => { resolveSubmit = resolve; })),
    };
    const view = render(
      <PublicMusicRequest
        publicSlug="public_slug-123"
        allowed
        actionsEnabled
        client={client as never}
        onOutcome={onOutcome}
        onRequestOutcome={onRequestOutcome}
      />,
    );
    await userEvent.type(screen.getByLabelText("Search for a song or paste a YouTube URL"), "song");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("button", { name: "Request Song by Artist" }));

    view.rerender(
      <PublicMusicRequest
        publicSlug="public_slug-123"
        allowed
        actionsEnabled={false}
        client={client as never}
        onOutcome={onOutcome}
        onRequestOutcome={onRequestOutcome}
      />,
    );
    resolveSubmit();
    await act(async () => { await Promise.resolve(); });

    expect(screen.queryByText("Song requested.")).not.toBeInTheDocument();
    expect(onOutcome.mock.calls.filter(([event]) => event.action === "request")).toHaveLength(0);
    expect(onRequestOutcome).not.toHaveBeenCalled();
  });
});
