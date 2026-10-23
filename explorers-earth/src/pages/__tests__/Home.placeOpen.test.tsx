import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { explorersApiClient } from "../../lib/explorersApiClient";
import { canonicalAccountFixture } from "../../test/canonicalAccountFixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type DocumentNode, useQuery } from "@apollo/client";
import useAuthStore from "../../store/store";
import {
  readExplorersAnalyticsEvents,
  type ExplorersAnalyticsRecord,
} from "../../services/explorersAnalyticsClient";
import Home, {
  getHomeAnalyticsCard,
  getHomeRecentAnalyticsScope,
} from "../Home";

const { accountScope, translate, navigate } = vi.hoisted(() => ({
  navigate: vi.fn(),
  accountScope: { current: "account-1" },
  translate: vi.fn((key: string, options?: Record<string, string>) => {
    const messages: Record<string, string> = {
      "dashboard.home.analytics.viewsLast90Days": "Views · last 90 days",
      "dashboard.home.analytics.loading": "Loading",
      "dashboard.home.analytics.unavailable": "Unavailable",
      "dashboard.home.analytics.ariaLabel": `${options?.label}: ${options?.value}`,
      "dashboard.home.tabs.places": "Places",
      "dashboard.home.tabs.movies": "Movies",
      "dashboard.home.tabs.books": "Books",
      "dashboard.home.tabs.games": "Games",
      "dashboard.home.tabs.guides": "Guides",
      "dashboard.home.tabs.apps": "Apps & Tools",
      "dashboard.home.tabs.products": "Products",
      "dashboard.home.tabs.people": "Persons",
    };
    return messages[key] ?? key;
  }),
}));
const nativeGames = vi.hoisted(()=>({read:vi.fn()}));
vi.mock('../../features/Games/hooks/useGamesOwner',()=>({useGamesOwner:nativeGames.read}));
const nativeBooks = vi.hoisted(()=>({read:vi.fn()}));
vi.mock('../../features/Books/api/useBooksOwnerContent',()=>({useBooksOwnerContent:nativeBooks.read}));
const nativeMovies = vi.hoisted(()=>({read:vi.fn()}));
vi.mock('../../features/Movies/api/explorersAdapter',async(importOriginal)=>({...await importOriginal<typeof import('../../features/Movies/api/explorersAdapter')>(),useMoviesOwner:nativeMovies.read}));

vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return { ...actual, useQuery: vi.fn(), useMutation: () => [vi.fn()] };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}));

vi.mock("../../services/explorersAnalyticsClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/explorersAnalyticsClient")>();
  return { ...actual, readExplorersAnalyticsEvents: vi.fn() };
});

vi.mock("../../hooks/useTunesDashboard", () => ({
  useTunesDashboard: () => ({}),
  musicWorkspaceClient: {},
}));

vi.mock("../../lib/explorersApiClient", () => ({ explorersApiClient: { getMyProfile: vi.fn() } }));

const render = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(ui, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
};

vi.mock("react-router-dom", () => ({ useLocation: () => ({ state: null }), useNavigate: () => navigate }));
vi.mock("../../features/Favorites/hooks/usePlacesOwner", () => ({ usePlacesOwner: () => ({ data: { recommendationLists: [{ documentId: "location-b", List_Name: "Beta City", Visibility: true, recommended_places: [], List_Name_Details: {} }] }, loading: false, error: undefined, refetch: vi.fn() }) }));

vi.mock("../../components/SEO", () => ({ default: () => null }));
vi.mock("../../components/ui/GlobeDemo", () => ({ GlobeDemo: () => <div /> }));
vi.mock("../../components/ProfileSetupAccordion", () => ({ default: () => null }));
vi.mock("../../components/ShareModal", () => ({ default: () => null }));
vi.mock("../../components/InteractiveMap", () => ({ default: () => null }));

const record = (type: "view" | "click" = "view"): ExplorersAnalyticsRecord => ({
  Account_Id: "account-1",
  Stats: [{
    type,
    timestamp: "2026-11-15T12:00:00.000Z",
    page: "public-profile",
    canonicalPath: "/explorer",
  }],
});

const operationName = (query: DocumentNode) =>
  query.definitions.find((definition) => definition.kind === "OperationDefinition")?.name?.value;

describe("Home place list click (OWN-18)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readExplorersAnalyticsEvents).mockResolvedValue([]);
    nativeGames.read.mockReturnValue({data:{gameLists:[]},loading:false,error:undefined,refetch:vi.fn()});
    nativeMovies.read.mockReturnValue({data:{movieLists:[]},loading:false,error:undefined,refetch:vi.fn()});
    nativeBooks.read.mockReturnValue({data:{bookLists:[]},loading:false,error:undefined,refetch:vi.fn()});
    vi.mocked(explorersApiClient.getMyProfile).mockImplementation(
      async () => canonicalAccountFixture({ id: accountScope.current }),
    );
    Element.prototype.scrollIntoView = vi.fn();
    accountScope.current = "account-1";
    useAuthStore.setState({
      isAuthenticated: true,
      token: null,
      user: {
        id: "1",
        documentId: "user-1",
        username: "explorer",
        email: "explorer@example.com",
        blocked: false,
      },
    });
  });

  it("opens that list, not the hub", async () => {
    render(<Home />);
    fireEvent.click(await screen.findByText("Beta City"));
    expect(navigate).toHaveBeenCalledWith("/recommendations/places?list=location-b");
    expect(navigate).not.toHaveBeenCalledWith("/recommendations");
  });
});
