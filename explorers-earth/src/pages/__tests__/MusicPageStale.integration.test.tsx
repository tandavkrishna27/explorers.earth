import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicPageContent } from "../Music";
import { loginSurface, surfaceHarness } from '../../features/navigation/__tests__/surfaceHarness';
import useAuthStore from '../../store/store';

vi.mock("../../components/SEO", () => ({ default: () => null }));
vi.mock("react-player", async () => {
  const React = await import("react");
  return {
    default: React.forwardRef((props: { playing?: boolean }, ref) => {
      React.useImperativeHandle(ref, () => ({ currentTime: 0 }));
      return <div data-testid="stale-music-media" data-playing={String(props.playing)} />;
    }),
  };
});

describe("Music page cached dashboard integration", () => {
  afterEach(() => { cleanup(); useAuthStore.getState().logout(); });
  it("keeps the last good dashboard mounted read-only when a refetch resolves with an error", async () => {
    const playlist = {
      id: 17,
      name: "Cached road mix",
      description: "Last successfully loaded playlist",
      isVisibleToGuests: false,
      songs: [],
    };
    const data = {
      playlists: [playlist],
      dashboard: {
        queueRevision: 4,
        songs: [],
        currentlyPlaying: null,
        playedSongs: [],
        publication: { mode: "private" as const, publicSlug: "cached-road-mix" },
      },
      entitlement: { state: "included" as const, coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 },
      guestControls: null,
      playlist: null,
      guestUrl: "cached-road-mix",
      localUser: null,
      identityStatus: "ready" as const,
      requestId: "refresh-request-17",
      isLoading: false,
      error: "Music is temporarily unavailable.",
      refetch: vi.fn().mockResolvedValue({ data: undefined, error: new Error("refresh failed") }),
      retryIdentity: vi.fn(),
    };

    loginSurface('user-17');
    const view = surfaceHarness(<MusicPageContent
      authenticated
      onboarding="complete"
      data={data}
      scope={{ userDocumentId: "user-17", accountDocumentId: "account-17" }}
      ownerWorkspace
      onAction={vi.fn()}
    />, { initial: { documentId: 'account-17' } });
    await view.ready();

    expect(screen.getByText(/May be out of date/).closest('[role="status"]')).toHaveTextContent("May be out of date");
    expect(screen.getByRole("tab", { name: "Playlists" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Cached road mix/ })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Make Cached road mix public" })).toBeDisabled();
    expect(screen.queryByText("Music is temporarily unavailable.")).not.toBeInTheDocument();
  });
});
