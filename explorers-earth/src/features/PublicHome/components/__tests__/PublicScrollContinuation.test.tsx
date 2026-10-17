import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicScrollContinuation } from "../PublicScrollContinuation";

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

const installIntersectionObserver = () => {
  const records: ObserverRecord[] = [];
  const Observer = vi.fn(function (
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    const record: ObserverRecord = {
      callback,
      options,
      observe: vi.fn(),
      disconnect: vi.fn(),
    };
    records.push(record);
    return {
      observe: record.observe,
      unobserve: vi.fn(),
      disconnect: record.disconnect,
      takeRecords: vi.fn(() => []),
      root: options?.root ?? null,
      rootMargin: options?.rootMargin ?? "0px",
      thresholds: [options?.threshold ?? 0].flat(),
    };
  });
  vi.stubGlobal("IntersectionObserver", Observer);
  return { Observer, records };
};

const intersect = (record: ObserverRecord, isIntersecting: boolean) => {
  act(() => {
    record.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
};

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PublicScrollContinuation", () => {
  it("loads only when its page-viewport sentinel intersects", async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    const { records } = installIntersectionObserver();

    render(
      <PublicScrollContinuation
        label="apps"
        hasMore
        loadingMore={false}
        loadMoreError={null}
        loadMore={loadMore}
      />,
    );

    expect(records).toHaveLength(1);
    expect(records[0].options).toEqual({
      root: null,
      rootMargin: "200px",
      threshold: 0,
    });
    expect(records[0].observe).toHaveBeenCalledWith(
      screen.getByRole("button", { name: "Load more apps" }).parentElement,
    );

    intersect(records[0], false);
    expect(loadMore).not.toHaveBeenCalled();

    intersect(records[0], true);
    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(1));
  });

  it("honors an existing horizontal scroll viewport as the observer root", () => {
    const root = document.createElement("div");
    const { records } = installIntersectionObserver();

    render(
      <PublicScrollContinuation
        label="books"
        root={root}
        hasMore
        loadingMore={false}
        loadMoreError={null}
        loadMore={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(records[0].options).toEqual({
      root,
      rootMargin: "200px",
      threshold: 0,
    });
  });

  it("does not observe or request while loading, failed, or finished", () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    const { Observer } = installIntersectionObserver();
    const { container, rerender } = render(
      <PublicScrollContinuation
        label="places"
        hasMore
        loadingMore
        loadMoreError={null}
        loadMore={loadMore}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading more places…");
    expect(screen.getByRole("button", { name: "Load more places" })).toBeDisabled();
    expect(screen.getByRole("button").parentElement).toHaveAttribute("aria-busy", "true");
    expect(Observer).not.toHaveBeenCalled();

    rerender(
      <PublicScrollContinuation
        label="places"
        hasMore
        loadingMore={false}
        loadMoreError={new Error("offline")}
        loadMore={loadMore}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Couldn’t load more places.");
    expect(screen.getByRole("button", { name: "Retry places" })).toBeEnabled();
    expect(Observer).not.toHaveBeenCalled();

    rerender(
      <PublicScrollContinuation
        label="places"
        hasMore={false}
        loadingMore={false}
        loadMoreError={null}
        loadMore={loadMore}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(loadMore).not.toHaveBeenCalled();
  });

  it("keeps manual loading available when IntersectionObserver is missing", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const user = userEvent.setup();
    const loadMore = vi.fn().mockResolvedValue(undefined);

    render(
      <PublicScrollContinuation
        label="movies"
        hasMore
        loadingMore={false}
        loadMoreError={null}
        loadMore={loadMore}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Load more movies" }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("allows keyboard retry after an error", async () => {
    installIntersectionObserver();
    const user = userEvent.setup();
    const loadMore = vi.fn().mockResolvedValue(undefined);

    render(
      <PublicScrollContinuation
        label="games"
        hasMore
        loadingMore={false}
        loadMoreError={new Error("offline")}
        loadMore={loadMore}
      />,
    );

    const retry = screen.getByRole("button", { name: "Retry games" });
    retry.focus();
    await user.keyboard("{Enter}");
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("allows pointer retry after an error", async () => {
    installIntersectionObserver();
    const user = userEvent.setup();
    const loadMore = vi.fn().mockResolvedValue(undefined);

    render(
      <PublicScrollContinuation
        label="games"
        hasMore
        loadingMore={false}
        loadMoreError={new Error("offline")}
        loadMore={loadMore}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Retry games" }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("coalesces repeated intersections while one request is pending", async () => {
    const pending = deferred<void>();
    const loadMore = vi.fn(() => pending.promise);
    const { records } = installIntersectionObserver();

    render(
      <PublicScrollContinuation
        label="people"
        hasMore
        loadingMore={false}
        loadMoreError={null}
        loadMore={loadMore}
      />,
    );

    intersect(records[0], true);
    intersect(records[0], true);
    expect(loadMore).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve());
    intersect(records[0], true);
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("does not automatically retry a settled failure while still visible", async () => {
    const pending = deferred<void>();
    const loadMore = vi.fn(() => pending.promise);
    const { records } = installIntersectionObserver();
    const { rerender } = render(
      <PublicScrollContinuation
        label="products"
        hasMore
        loadingMore={false}
        loadMoreError={null}
        loadMore={loadMore}
      />,
    );

    intersect(records[0], true);
    await act(async () => pending.reject(new Error("offline")));
    intersect(records[0], false);
    intersect(records[0], true);
    expect(loadMore).toHaveBeenCalledTimes(1);

    rerender(
      <PublicScrollContinuation
        label="products"
        hasMore
        loadingMore={false}
        loadMoreError={new Error("offline")}
        loadMore={loadMore}
      />,
    );
    expect(screen.getByRole("button", { name: "Retry products" })).toBeEnabled();
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("observes the next continuation after a successful appended page", async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    const { records } = installIntersectionObserver();
    const props = {
      label: "guides",
      hasMore: true,
      loadMoreError: null,
      loadMore,
    };
    const { rerender } = render(
      <PublicScrollContinuation {...props} loadingMore={false} />,
    );

    intersect(records[0], true);
    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(1));

    rerender(<PublicScrollContinuation {...props} loadingMore />);
    rerender(<PublicScrollContinuation {...props} loadingMore={false} />);
    expect(records).toHaveLength(2);

    intersect(records[1], true);
    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(2));
  });

  it("loads again after a fulfilled request when unchanged final props leave and re-enter view", async () => {
    const pending = deferred<void>();
    const loadMore = vi.fn(() => pending.promise);
    const { records } = installIntersectionObserver();
    const props = {
      label: "guides",
      hasMore: true,
      loadingMore: false,
      loadMoreError: null,
      loadMore,
    };

    const { rerender } = render(<PublicScrollContinuation {...props} />);

    intersect(records[0], true);
    expect(loadMore).toHaveBeenCalledTimes(1);
    rerender(<PublicScrollContinuation {...props} />);
    await act(async () => pending.resolve());
    await waitFor(() => expect(records).toHaveLength(2));

    intersect(records[1], false);
    intersect(records[1], true);
    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(2));
  });

  it("re-evaluates a continuously visible sentinel after a confirmed successful append", async () => {
    const pending = deferred<void>();
    const loadMore = vi.fn(() => pending.promise);
    const { records } = installIntersectionObserver();
    const props = {
      label: "guides",
      hasMore: true,
      loadingMore: false,
      loadMoreError: null,
      loadMore,
    };
    const { rerender } = render(<PublicScrollContinuation {...props} />);

    intersect(records[0], true);
    rerender(<PublicScrollContinuation {...props} />);
    await act(async () => pending.resolve());
    await waitFor(() => expect(records).toHaveLength(2));

    intersect(records[1], true);
    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(2));
  });

  it("re-arms when fulfillment happens before the confirming append commit", async () => {
    const pending = deferred<void>();
    const loadMore = vi.fn(() => pending.promise);
    const { records } = installIntersectionObserver();
    const props = {
      label: "guides",
      hasMore: true,
      loadingMore: false,
      loadMoreError: null,
      loadMore,
    };
    const { rerender } = render(<PublicScrollContinuation {...props} />);

    intersect(records[0], true);
    await act(async () => pending.resolve());
    expect(records).toHaveLength(1);

    rerender(<PublicScrollContinuation {...props} />);
    await waitFor(() => expect(records).toHaveLength(2));
    intersect(records[1], true);
    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(2));
  });

  it("keeps a fulfilled request latched until a result commit confirms continuation", async () => {
    const pending = deferred<void>();
    const loadMore = vi.fn(() => pending.promise);
    const { records } = installIntersectionObserver();

    render(
      <PublicScrollContinuation
        label="guides"
        hasMore
        loadingMore={false}
        loadMoreError={null}
        loadMore={loadMore}
      />,
    );

    intersect(records[0], true);
    await act(async () => pending.resolve());
    intersect(records[0], false);
    intersect(records[0], true);
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("keeps a handled error latched when loadMore resolves after publishing the error", async () => {
    const pending = deferred<void>();
    const loadMore = vi.fn(() => pending.promise);
    const { records } = installIntersectionObserver();
    const props = {
      label: "guides",
      hasMore: true,
      loadingMore: false,
      loadMore,
    };
    const { rerender } = render(
      <PublicScrollContinuation {...props} loadMoreError={null} />,
    );

    intersect(records[0], true);
    rerender(
      <PublicScrollContinuation
        {...props}
        loadMoreError={new Error("offline")}
      />,
    );
    await act(async () => pending.resolve());

    intersect(records[0], false);
    intersect(records[0], true);
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Retry guides" })).toBeEnabled();
  });

  it("uses the latest load callback without leaving a stale observer behind", async () => {
    const firstLoad = vi.fn().mockResolvedValue(undefined);
    const nextLoad = vi.fn().mockResolvedValue(undefined);
    const { records } = installIntersectionObserver();
    const { rerender, unmount } = render(
      <PublicScrollContinuation
        label="apps"
        hasMore
        loadingMore={false}
        loadMoreError={null}
        loadMore={firstLoad}
      />,
    );

    rerender(
      <PublicScrollContinuation
        label="apps"
        hasMore
        loadingMore={false}
        loadMoreError={null}
        loadMore={nextLoad}
      />,
    );
    intersect(records[0], true);
    await waitFor(() => expect(nextLoad).toHaveBeenCalledTimes(1));
    expect(firstLoad).not.toHaveBeenCalled();

    unmount();
    expect(records[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it("applies the caller class without replacing theme-backed presentation", () => {
    installIntersectionObserver();
    render(
      <PublicScrollContinuation
        label="apps"
        className="custom-position"
        hasMore
        loadingMore={false}
        loadMoreError={null}
        loadMore={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const continuation = screen.getByRole("button").parentElement;
    expect(continuation).toHaveClass("custom-position");
    expect(continuation).toHaveStyle({
      background: "var(--bg-card)",
      color: "var(--text-primary)",
    });
  });
});
