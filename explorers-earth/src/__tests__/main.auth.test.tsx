import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpLink } from "@apollo/client";

const harness = vi.hoisted(() => ({
  contextCallback: undefined as
    | ((
        operation: { operationName?: string },
        context: { headers?: Record<string, string> },
      ) => { headers: Record<string, string> })
    | undefined,
  render: vi.fn(),
  mapsProvider: vi.fn(({ children }: { children: React.ReactNode }) => children),
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
  APIProvider: harness.mapsProvider,
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

  it("does not eagerly initialize Google Maps for every application route", () => {
    const containsMapsProvider = (node: unknown): boolean => {
      if (!node || typeof node !== "object") return false;
      const element = node as { type?: unknown; props?: { children?: unknown } };
      if (element.type === harness.mapsProvider) return true;
      const children = element.props?.children;
      return Array.isArray(children)
        ? children.some(containsMapsProvider)
        : containsMapsProvider(children);
    };

    expect(containsMapsProvider(harness.render.mock.calls[0]?.[0])).toBe(false);
  });

  it("omits authorization when a public visitor has no session token", () => {
    const result = harness.contextCallback!(
      { operationName: "CheckUsername" },
      { headers: { accept: "application/json" } },
    );

    expect(result.headers).toEqual({ accept: "application/json" });
  });

  it("never forwards an old qrtoken to retained Strapi Apollo calls", () => {
    localStorage.setItem("qrtoken", "session-token");

    const result = harness.contextCallback!(
      { operationName: "UpdateAccount" },
      { headers: { accept: "application/json" } },
    );

    expect(result.headers).toEqual({ accept: "application/json" });
  });

  it("omits browser cookies from retained Strapi Apollo requests", () => {
    expect(createHttpLink).toHaveBeenCalledWith(expect.objectContaining({ credentials: "omit" }));
  });
});
