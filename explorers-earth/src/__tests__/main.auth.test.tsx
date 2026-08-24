import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  contextCallback: undefined as
    | ((
        operation: { operationName?: string },
        context: { headers?: Record<string, string> },
      ) => { headers: Record<string, string> })
    | undefined,
  render: vi.fn(),
}));

vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({ render: harness.render })),
}));

vi.mock("@apollo/client/link/context", () => ({
  setContext: vi.fn((callback) => {
    harness.contextCallback = callback;
    return { concat: vi.fn(() => ({})) };
  }),
}));

vi.mock("@apollo/client", () => ({
  ApolloClient: vi.fn(),
  ApolloProvider: ({ children }: { children: React.ReactNode }) => children,
  InMemoryCache: vi.fn(),
  createHttpLink: vi.fn(() => ({})),
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("react-helmet-async", () => ({
  HelmetProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("sonner", () => ({ Toaster: () => null }));
vi.mock("../App.tsx", () => ({ default: () => null }));
vi.mock("../components/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../lib/apolloCache", () => ({ typePolicies: {} }));
vi.mock("../lib/queryClient", () => ({ queryClient: {} }));
vi.mock("../utils/analytics", () => ({ initAnalytics: vi.fn() }));

describe("Apollo authorization headers", () => {
  beforeAll(async () => {
    await import("../main.tsx");
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it("omits authorization when a public visitor has no session token", () => {
    const result = harness.contextCallback!(
      { operationName: "CheckUsername" },
      { headers: { accept: "application/json" } },
    );

    expect(result.headers).toEqual({ accept: "application/json" });
  });

  it("forwards the authenticated visitor's session token", () => {
    localStorage.setItem("qrtoken", "session-token");

    const result = harness.contextCallback!(
      { operationName: "UpdateAccount" },
      { headers: { accept: "application/json" } },
    );

    expect(result.headers).toEqual({
      accept: "application/json",
      authorization: "Bearer session-token",
    });
  });
});
