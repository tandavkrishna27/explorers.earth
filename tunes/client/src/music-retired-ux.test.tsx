import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboard from "./pages/AdminDashboard";
import SettingsPage from "./pages/settings-page";
import TermsPage from "./pages/terms-page";
import PrivacyPage from "./pages/privacy-page";
import ImportYouTubePlaylist from "./components/import-youtube-playlist";

vi.mock("./hooks/use-auth", () => ({ useAuth: () => ({ user: { id: 17, guestUrl: "owner-a", username: "owner" } }) }));
vi.mock("./hooks/use-profile", () => ({ useProfile: () => ({ profile: undefined, isLoading: false }) }));
vi.mock("./hooks/use-websocket", () => ({ useWebSocket: () => ({ sendMessage: () => undefined, isConnected: false }) }));
vi.mock("./hooks/use-toast", () => ({ useToast: () => ({ toast: () => undefined }) }));
vi.mock("./lib/strapi-queries", () => ({ useUserSubscriptionPlanInfo: () => ({ plan: undefined, songRequests: 0, songsQuota: 0, isLoading: false, isActivePlan: false }) }));

function render(element: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    React.createElement(HelmetProvider, null,
      React.createElement(QueryClientProvider, { client }, element)),
  );
}

describe("retired Music feature UX", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("retired network call"); }));
  });

  it("renders canonical static legal content without retired page-content requests", () => {
    // Break caught: public legal routes render a loading/error shell backed by a known-410 endpoint.
    expect(render(React.createElement(TermsPage))).toContain("These terms govern your use of Local Tunes");
    expect(render(React.createElement(PrivacyPage))).toContain("Local Tunes processes only the information needed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders explicit Explorer replacement UX for active settings and admin routes", () => {
    // Break caught: routed screens expose enabled forms that optimistically write or call retired APIs.
    const settings = render(React.createElement(SettingsPage));
    const admin = render(React.createElement(AdminDashboard));
    expect(settings).toContain("Account, device, password, and subscription settings are managed in Explorer");
    expect(admin).toContain("Music administration is unavailable in Local Tunes");
    expect(settings).not.toContain("<form");
    expect(admin).not.toContain("<form");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders playlist import as disabled entitlement guidance with no submit action", () => {
    // Break caught: an enabled import form accepts input and then deliberately throws without a server call.
    const html = render(React.createElement(ImportYouTubePlaylist, { playlistId: 9 }));
    expect(html).toContain("Playlist import is unavailable in this Music release");
    expect(html).not.toContain("<input");
    expect(html).not.toContain('type="submit"');
    expect(fetch).not.toHaveBeenCalled();
  });
});
