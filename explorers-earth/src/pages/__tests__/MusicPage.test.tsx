import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMusicWorkspaceClient } from "../../features/music/musicWorkspaceClient";
import { MusicPageContent, resolveOwnerWorkspaceExposure } from "../Music";
import * as MusicPageModule from "../Music";

vi.mock("../../components/SEO", () => ({ default: () => null }));
vi.mock("../../components/MusicDashboard", () => ({ default: ({ complete, readOnly }: { complete?: boolean; readOnly?: boolean }) => <div data-testid="music-content" data-complete={complete ? "true" : "false"} data-read-only={readOnly ? "true" : "false"} /> }));

const data: any = {
  playlists: [], dashboard: null, entitlement: null, playlist: null, guestUrl: null, localUser: null,
  identityStatus: "setting_up", isLoading: true, error: null, refetch: vi.fn(), retryIdentity: vi.fn(),
};

describe("Music page state hierarchy", () => {
  it("uses a local preview without changing the server-governed production decision", () => {
    expect(resolveOwnerWorkspaceExposure(false, true)).toBe(true);
    expect(resolveOwnerWorkspaceExposure(true, false)).toBe(true);
    expect(resolveOwnerWorkspaceExposure(false, false)).toBe(false);
  });
  it("keeps the existing minimal workspace unless the runtime owner decision is true", () => {
    const ready = { ...data, identityStatus: "ready", isLoading: false, dashboard: { songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: "private", publicSlug: "slug" } }, entitlement: { state: "included", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 } };
    const first = render(<MusicPageContent authenticated onboarding="complete" data={ready} ownerWorkspace={false} onAction={vi.fn()} />);
    expect(screen.getByTestId("music-content")).toHaveAttribute("data-complete", "false");
    first.unmount();
    render(<MusicPageContent authenticated onboarding="complete" data={ready} ownerWorkspace onAction={vi.fn()} />);
    expect(screen.getByTestId("music-content")).toHaveAttribute("data-complete", "true");
  });
  // The eligibility read is the canonical account now, so the five Strapi fields this used
  // to infer completeness from - Account_Name, Account_Type, mobile_number, provider and
  // confirmed - are one column, onboarding_status. The provider and confirmation cases are
  // gone because the canonical profile read refuses a non-Google identity outright, so one
  // never reaches here to be judged.
  //
  // What is kept, and is the reason this case exists: "unknown" stays distinct from
  // "incomplete" while the read is pending or failed. Collapsing them would tell a creator
  // with a finished account to go and finish it every time the network blinked.
  it("treats a pending or failed eligibility read as unknown, never as incomplete", () => {
    const select = (MusicPageModule as any).onboardingFromEligibility;
    expect(typeof select).toBe("function");
    expect(select({ isPending: true, error: null, data: undefined })).toBe("unknown");
    expect(select({ isPending: false, error: new Error("network"), data: undefined })).toBe("unknown");
    // Error wins over retained data: a stale account must not be read as authoritative.
    expect(select({ isPending: false, error: new Error("partial"), data: { onboardingStatus: "complete" } })).toBe("unknown");
    expect(select({ isPending: false, error: null, data: null })).toBe("unknown");
    expect(select({ isPending: false, error: null, data: { onboardingStatus: "incomplete" } })).toBe("incomplete");
    expect(select({ isPending: false, error: null, data: {} })).toBe("incomplete");
    expect(select({ isPending: false, error: null, data: { onboardingStatus: "complete" } })).toBe("complete");
  });

  it("keeps the stable Music title and exactly one polite inline setup status immediately below it", () => {
    const { container } = render(<MusicPageContent authenticated onboarding="complete" data={data} onAction={vi.fn()} />);
    const title = screen.getByRole("heading", { name: "Music", level: 1 });
    expect(title.nextElementSibling).toBe(screen.getByRole("status"));
    expect(screen.getByRole("status")).toHaveTextContent("Setting up Music…");
    expect(container.querySelectorAll("[role='status'], [role='alert']")).toHaveLength(1);
  });

  it("renders a terminal conflict once with Get help and no contradictory content", () => {
    render(<MusicPageContent authenticated onboarding="complete" data={{ ...data, identityStatus: "conflict", isLoading: false }} onAction={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t finish setting up Music for this account.");
    expect(screen.getByRole("button", { name: "Get help" })).toBeInTheDocument();
    expect(screen.queryByTestId("music-content")).not.toBeInTheDocument();
  });

  it("does not let an unfetched entitlement mask a retryable identity failure", () => {
    render(<MusicPageContent authenticated onboarding="complete" data={{ ...data, identityStatus: "retryable", isLoading: false }} onAction={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Music is taking longer than expected. Your Explorers account is ready.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps a retryable identity action visible when entitlement is unresolved", () => {
    render(<MusicPageContent authenticated onboarding="complete" data={{
      ...data,
      identityStatus: "retryable",
      isLoading: false,
      entitlement: null,
    }} onAction={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Music is taking longer than expected. Your Explorers account is ready.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByTestId("music-content")).not.toBeInTheDocument();
  });

  it("keeps a content failure retry action visible when entitlement is unresolved", () => {
    render(<MusicPageContent authenticated onboarding="complete" data={{
      ...data,
      identityStatus: "ready",
      isLoading: false,
      error: new Error("offline"),
      entitlement: null,
    }} onAction={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Music is temporarily unavailable.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByTestId("music-content")).not.toBeInTheDocument();
  });

  it("keeps stale dashboard content read-only with its retry action when entitlement is unresolved", () => {
    render(<MusicPageContent authenticated onboarding="complete" data={{
      ...data,
      identityStatus: "ready",
      isLoading: false,
      error: new Error("offline"),
      dashboard: { songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: "private", publicSlug: "public-slug" } },
      entitlement: { state: "unknown", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 },
    }} onAction={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("May be out of date");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByTestId("music-content")).toHaveAttribute("data-read-only", "true");
  });

  it("shows a sanitized correlation ID only under Technical details", () => {
    render(<MusicPageContent authenticated onboarding="complete" data={{
      ...data,
      identityStatus: "unavailable",
      isLoading: false,
      requestId: "safe-request-42",
    }} onAction={vi.fn()} />);

    const details = screen.getByText("Technical details").closest("details");
    expect(details).toHaveTextContent("Request ID: safe-request-42");
    expect(screen.queryByText("Request ID: safe-request-42", { selector: "section > p" })).not.toBeInTheDocument();
  });

  it.each(["suspended", "pending_deletion"] as const)("hides cached workspace content after terminal %s authority", (identityStatus) => {
    render(<MusicPageContent
      authenticated
      onboarding="complete"
      data={{
        ...data,
        identityStatus,
        isLoading: false,
        playlists: [{ id: 7, name: "Cached private playlist", description: null, isVisibleToGuests: false, songs: [] }],
        dashboard: { songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: "private", publicSlug: "public-slug" } },
      }}
      onAction={vi.fn()}
    />);
    expect(screen.queryByText("Cached private playlist")).not.toBeInTheDocument();
    expect(screen.queryByTestId("music-content")).not.toBeInTheDocument();
  });

  it("renders healthy core content silently", () => {
    const ready = {
      ...data,
      identityStatus: "ready",
      isLoading: false,
      dashboard: { songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: "private", publicSlug: "public-slug" } },
      entitlement: { state: "included", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 },
    };
    const { container } = render(<MusicPageContent authenticated onboarding="complete" data={ready} onAction={vi.fn()} />);
    expect(screen.getByTestId("music-content")).toBeInTheDocument();
    expect(container.querySelector("[role='status'], [role='alert']")).toBeNull();
  });

  it("renders entitlement loading as a silent skeleton without stale workspace controls", () => {
    const checking = {
      ...data,
      identityStatus: "ready",
      isLoading: false,
      dashboard: { songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: "private", publicSlug: "public-slug" } },
      entitlement: null,
    };
    const { container } = render(<MusicPageContent authenticated onboarding="complete" data={checking} onAction={vi.fn()} />);

    expect(screen.queryByText("Checking what’s included…")).not.toBeInTheDocument();
    expect(screen.queryByTestId("music-content")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(2);
    expect(container.querySelector("[role='status'], [role='alert']")).toBeNull();
  });

  it.each([
    ["unknown", true],
    ["included", true],
    ["eligible", true],
    ["entitled", true],
    ["revoked", true],
  ] as const)("renders server-derived %s without inventing a core denial", async (entitlementState, showsWorkspace) => {
    // Break caught: eligible/revoked is presented as upgrade/paused/read-only instead of preserving universal core Music.
    const loaded = await createMusicWorkspaceClient(async (input) => input.path === "/api/playlists"
      ? new Response("[]", { status: 200 })
      : input.path === "/api/music/dashboard"
        ? new Response(JSON.stringify({ queueRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: "private", publicSlug: "public-slug" } }), { status: 200 })
        : new Response(JSON.stringify({ state: entitlementState, coreRead: true, coreMutation: true, paidMutation: entitlementState === "entitled", maxAgeSeconds: 600, ...(entitlementState === "entitled" ? { sourceUpdatedAt: "2026-08-20T17:00:00.000Z" } : {}) }), { status: 200 })).load();
    const ready = {
      ...data,
      ...loaded,
      identityStatus: "ready",
      isLoading: false,
    };
    const { unmount } = render(<MusicPageContent authenticated onboarding="complete" data={ready} onAction={vi.fn()} />);
    if (showsWorkspace) expect(screen.getByTestId("music-content")).toBeInTheDocument();
    else {
      expect(screen.queryByTestId("music-content")).not.toBeInTheDocument();
      expect(document.querySelectorAll(".animate-pulse")).toHaveLength(2);
    }
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/temporarily paused|isn’t included|Music limit|can’t make changes/i)).not.toBeInTheDocument();
    unmount();
  });
});
