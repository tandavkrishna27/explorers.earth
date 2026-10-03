import { render as rtlRender, screen, waitFor } from "@testing-library/react";
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

const { accountQuery, accountScope, translate } = vi.hoisted(() => ({
  accountQuery: {
    loading: false,
    error: undefined as Error | undefined,
    hasCachedAccount: false,
  },
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

describe("Home analytics", () => {
  const queryMock = vi.mocked(useQuery);
  const readEvents = vi.mocked(readExplorersAnalyticsEvents);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(explorersApiClient.getMyProfile).mockResolvedValue(canonicalAccountFixture());
    Element.prototype.scrollIntoView = vi.fn();
    accountQuery.loading = false;
    accountQuery.error = undefined;
    accountQuery.hasCachedAccount = false;
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
    queryMock.mockImplementation((query) => {
      const operation = operationName(query);
      if (operation === "GetUserAccount") {
        return {
          data: (accountQuery.loading && !accountQuery.hasCachedAccount) || accountQuery.error ? undefined : {
            usersPermissionsUser: {
              accounts: [{
                documentId: accountScope.current,
                Account_Name: "Explorer",
                Account_Type: "personal",
                mobile_number: "1234567890",
              }],
            },
          },
          loading: accountQuery.loading,
          error: accountQuery.error,
          refetch: vi.fn(),
        } as never;
      }
      if (operation === "user") {
        return {
          data: {
            accounts: [{
              documentId: accountScope.current,
              Account_Name: "Explorer",
              Feed_Data: [],
              recommendation_lists: [],
            }],
          },
          loading: false,
          error: undefined,
          refetch: vi.fn(),
        } as never;
      }
      return { data: undefined, loading: false, error: undefined, refetch: vi.fn() } as never;
    });
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

  it("keeps analytics loading on a cold account lookup before requesting the resolved account", async () => {
    accountQuery.loading = true;
    readEvents.mockReturnValue(new Promise(() => undefined));

    const view = render(<Home />);

    expect(readEvents).not.toHaveBeenCalled();

    accountQuery.loading = false;
    useAuthStore.setState((state) => ({
      user: state.user ? { ...state.user } : null,
    }));
    view.rerender(<Home />);

    await waitFor(() => expect(readEvents).toHaveBeenCalledWith(expect.objectContaining({ accountId: "account-1" })));
    expect(await screen.findByRole("status", { name: "Views · last 90 days: Loading" })).toBeInTheDocument();
  });

  it("does not request analytics when the account lookup completes with an error", async () => {
    accountQuery.error = new Error("account lookup failed");

    render(<Home />);

    await Promise.resolve();
    expect(readEvents).not.toHaveBeenCalled();
  });

  it("keeps the card loading without querying a retained account while Apollo refetches it", async () => {
    accountQuery.loading = true;
    accountQuery.hasCachedAccount = true;

    render(<Home />);

    expect(await screen.findByRole("status", { name: "Views · last 90 days: Loading" })).toBeInTheDocument();
    await Promise.resolve();
    expect(readEvents).not.toHaveBeenCalled();
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
