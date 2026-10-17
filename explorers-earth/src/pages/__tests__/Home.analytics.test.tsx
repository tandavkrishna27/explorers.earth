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

const { accountScope, translate } = vi.hoisted(() => ({
  accountScope: { current: "account-1" },
  translate: vi.fn((key: string, options?: Record<string, string>) => {
    const messages: Record<string, string> = {
      "dashboard.home.analytics.viewsLast90Days": "Views · last 90 days",
      "dashboard.home.analytics.loading": "Loading",
      "dashboard.home.analytics.unavailable": "Unavailable",
      "dashboard.home.analytics.ariaLabel": `${options?.label}: ${options?.value}`,
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

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ state: null }),
  useNavigate: () => vi.fn(),
}));

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

/*
 * The media ids in these fixtures are uuids because `media_assets.id` is a `uuid` column
 * (`0024_explorers_profile_media.sql:29`) and every projection interpolates it directly, so
 * `/api/explorers/v1/media/poster/content` was never a shape the server can emit.
 *
 * It passed before only because the page recognised canonical media by prefix, and loosely:
 * `type === 'movie' && path.startsWith('/api/')`. The shared `isCanonicalMediaPath` matches
 * the whole route, which is what stops anything else under `/api` being treated as media -
 * so the fixture had to become realistic rather than the check permissive.
 */
describe("Home analytics", () => {
  const queryMock = vi.mocked(useQuery);
  const readEvents = vi.mocked(readExplorersAnalyticsEvents);

  beforeEach(() => {
    vi.clearAllMocks();
    nativeGames.read.mockReturnValue({data:{gameLists:[]},loading:false,error:undefined,refetch:vi.fn()});
    nativeMovies.read.mockReturnValue({data:{movieLists:[]},loading:false,error:undefined,refetch:vi.fn()});
    nativeBooks.read.mockReturnValue({data:{bookLists:[]},loading:false,error:undefined,refetch:vi.fn()});
    // Read at call time, so a case that changes the signed-in identity gets the account
    // that identity resolves to rather than the one captured when the mock was set up.
    vi.mocked(explorersApiClient.getMyProfile).mockImplementation(
      async () => canonicalAccountFixture({ id: accountScope.current }),
    );
    Element.prototype.scrollIntoView = vi.fn();
    accountScope.current = "account-1";
    useAuthStore.setState({
      isAuthenticated: true,
      token: "private-user-token",
      user: {
        id: "1",
        documentId: "user-1",
        username: "explorer",
        email: "explorer@example.com",
        blocked: false,
      },
    });
  });

  it('reads Movies summary through native ownership without a legacy Movies Apollo query',async()=>{
    readEvents.mockResolvedValue([]);
    nativeMovies.read.mockReturnValue({data:{movieLists:[{documentId:'native-list',List_Name:'Native Movie summary',Visibility:true,recommended_movies:[{poster_path:'/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content',title:'Native recommendation'}]}]},loading:false,error:undefined,refetch:vi.fn()});
    render(<Home/>);
    fireEvent.click(await screen.findByRole('button',{name:/Movies/}));
    expect(await screen.findByText('Native Movie summary')).toBeInTheDocument();
    expect(nativeMovies.read).toHaveBeenCalled();
    // Stronger than the operation-name check this replaces: the dashboard issues no Apollo
    // query at all, so there is no legacy Movies read to look for.
    expect(queryMock).not.toHaveBeenCalled();
    expect(screen.getByAltText('Native Movie summary')).toHaveAttribute('src','/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content');
  });

  it('reads Games summary through native ownership without a legacy Games Apollo query',async()=>{
    readEvents.mockResolvedValue([]);
    nativeGames.read.mockReturnValue({data:{gameLists:[{documentId:'native-list',List_Name:'Native Game summary',Visibility:true,recommended_games:[{cover_url:'/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content',title:'Native recommendation'}]}]},loading:false,error:undefined,refetch:vi.fn()});
    render(<Home/>);
    fireEvent.click(await screen.findByRole('button',{name:/Games/}));
    expect(await screen.findByText('Native Game summary')).toBeInTheDocument();
    expect(nativeGames.read).toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
    expect(screen.getByAltText('Native Game summary')).toHaveAttribute('src','/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content');
  });

  /*
   * Books, because movies and games were the two types the page already special-cased and
   * so the only two this file covered. Book, guide and place covers fell through to the
   * Strapi-origin branch, so a canonical cover on this dashboard was requested from
   * `VITE_REST_API_URL` (or `http://localhost:1337`) instead of this origin. One of the
   * three is now held by a rendered assertion.
   */
  it('leaves a canonical Books cover on this origin instead of the Strapi host',async()=>{
    readEvents.mockResolvedValue([]);
    nativeBooks.read.mockReturnValue({data:{bookLists:[{documentId:'native-list',List_Name:'Native Book summary',visibility:true,cover_image:{url:'/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content'},recommended_books:[]}]},loading:false,error:undefined,refetch:vi.fn()});
    render(<Home/>);
    fireEvent.click(await screen.findByRole('button',{name:/Books/}));
    expect(await screen.findByText('Native Book summary')).toBeInTheDocument();
    expect(screen.getByAltText('Native Book summary')).toHaveAttribute('src','/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content');
  });

  it("builds exactly the last 90 local calendar dates", () => {
    expect(getHomeRecentAnalyticsScope(
      new Date(2026, 10, 15, 14),
      "America/New_York",
    )).toEqual({
      fromDate: "2026-08-18",
      toDate: "2026-11-15",
      timeZone: "America/New_York",
    });
  });

  it("distinguishes a successful zero from loading and an unavailable read", () => {
    expect(getHomeAnalyticsCard("loading", [])).toMatchObject({ value: "Loading" });
    expect(getHomeAnalyticsCard("unavailable", [])).toMatchObject({ value: "Unavailable" });
    expect(getHomeAnalyticsCard("ready", [])).toMatchObject({ value: "0" });
    expect(getHomeAnalyticsCard("ready", [record(), record("click")])).toMatchObject({ value: "1" });
  });

  it("requests the bounded signed-in account scope and labels the loading card accessibly", async () => {
    readEvents.mockReturnValue(new Promise(() => undefined));

    render(<Home />);

    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(1));
    const scope = readEvents.mock.calls[0][0];
    expect(scope).toMatchObject({
      accountId: "account-1",
      token: "private-user-token",
      fromDate: expect.any(String),
      toDate: expect.any(String),
    });
    expect(Date.parse(scope.toDate) - Date.parse(scope.fromDate)).toBeLessThanOrEqual(93 * 86_400_000);
    expect(await screen.findByRole("status", { name: "Views · last 90 days: Loading" })).toBeInTheDocument();
  });

  it("keeps analytics loading on a cold account read before requesting the resolved account", async () => {
    let resolveAccount!: () => void;
    vi.mocked(explorersApiClient.getMyProfile).mockImplementation(() => new Promise((resolve) => {
      resolveAccount = () => resolve(canonicalAccountFixture({ id: accountScope.current }));
    }));
    readEvents.mockReturnValue(new Promise(() => undefined));

    render(<Home />);

    expect(readEvents).not.toHaveBeenCalled();

    resolveAccount();

    await waitFor(() => expect(readEvents).toHaveBeenCalledWith(expect.objectContaining({ accountId: "account-1" })));
    expect(await screen.findByRole("status", { name: "Views · last 90 days: Loading" })).toBeInTheDocument();
  });

  it("does not request analytics when the account read fails", async () => {
    vi.mocked(explorersApiClient.getMyProfile).mockRejectedValue(new Error("account read failed"));

    render(<Home />);

    await Promise.resolve();
    expect(readEvents).not.toHaveBeenCalled();
  });

  // This replaces a case that asserted the card stayed loading rather than query a retained
  // Apollo result during a refetch. There is no retained result to guard any more: the
  // canonical read is keyed by identity and session generation, so a different viewer is a
  // different cache entry with no data, not a stale one. The privacy guarantee that case
  // existed for is asserted directly instead - a signed-in viewer's analytics are never
  // read for the previous viewer's account.
  it("never reads analytics for the previous viewer's account after the identity changes", async () => {
    readEvents.mockResolvedValue([]);
    const view = render(<Home />);
    await waitFor(() => expect(readEvents).toHaveBeenCalledWith(expect.objectContaining({ accountId: "account-1" })));

    accountScope.current = "account-2";
    useAuthStore.setState({
      user: { id: "2", documentId: "user-2", username: "other-explorer", email: "other@example.com", blocked: false },
    });
    view.rerender(<Home />);

    await waitFor(() => expect(readEvents).toHaveBeenCalledWith(expect.objectContaining({ accountId: "account-2" })));
    expect(readEvents.mock.calls.filter(([scope]) => scope.accountId === "account-1")).toHaveLength(1);
  });

  it("renders a successful empty analytics response as an accessible visible zero", async () => {
    readEvents.mockResolvedValue([]);

    render(<Home />);

    const zero = await screen.findByRole("status", { name: "Views · last 90 days: 0" });
    expect(zero).toHaveTextContent("0");
    expect(zero).toBeVisible();
  });

  it("renders a failed read as an accessible unavailable value instead of zero", async () => {
    readEvents.mockRejectedValue(new Error("offline"));

    render(<Home />);

    expect(await screen.findByRole("status", { name: "Views · last 90 days: Unavailable" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Views · last 90 days: 0" })).not.toBeInTheDocument();
  });

  it("keeps a prior account response from replacing the active account's view count", async () => {
    let resolveFirst!: (records: ExplorersAnalyticsRecord[]) => void;
    const firstRead = new Promise<ExplorersAnalyticsRecord[]>((resolve) => { resolveFirst = resolve; });
    readEvents.mockReturnValueOnce(firstRead).mockResolvedValueOnce([record(), record()]);

    const view = render(<Home />);
    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(1));
    accountScope.current = "account-2";
    useAuthStore.setState({
      user: {
        id: "2",
        documentId: "user-2",
        username: "other-explorer",
        email: "other@example.com",
        blocked: false,
      },
    });
    view.rerender(<Home />);

    await waitFor(() => expect(readEvents).toHaveBeenCalledTimes(2));
    resolveFirst([record(), record(), record()]);

    expect(await screen.findByRole("status", { name: "Views · last 90 days: 2" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Views · last 90 days: 3" })).not.toBeInTheDocument();
  });
});
