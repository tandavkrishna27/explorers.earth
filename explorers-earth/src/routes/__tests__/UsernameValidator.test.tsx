import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { getPublicAccountBasicQuery } from "../../features/PublicHome/api/query";
import UsernameValidator from "../validators/UsernameValidator";

const mockNavigate = vi.fn();
let mockLocationPathname = "/tk2727";
let mockLocationSearch = "";
let mockLocationHash = "";
let mockUsername = "tk2727";
let mockQueryData = {
  accounts: [{ documentId: "acct-1", username: "tk2727", Account_Name: "Demo User" }],
};
let mockQueryLoading = false;
let mockQueryError: Error | undefined;
const mockUseQuery = vi.hoisted(() => vi.fn());
const usePublicAccountIdentity = vi.hoisted(() => vi.fn());
const coldReports = vi.hoisted(() => ({ reportValidation: vi.fn() }));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ username: mockUsername }),
  useLocation: () => ({
    pathname: mockLocationPathname,
    search: mockLocationSearch,
    hash: mockLocationHash,
  }),
}));

vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return {
    ...actual,
    useQuery: mockUseQuery,
  };
});

vi.mock("../../layouts/PublicColdEntryBoundary", () => ({
  usePublicColdEntry: () => coldReports,
}));
vi.mock("../../features/music/PublicMusicAvailabilityProvider", () => ({ usePublicAccountIdentity }));

describe("UsernameValidator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryData = {
      accounts: [{ documentId: "acct-1", username: "tk2727", Account_Name: "Demo User" }],
    };
    mockQueryLoading = false;
    mockQueryError = undefined;
    mockUsername = "tk2727";
    mockLocationSearch = "";
    mockLocationHash = "";
    mockUseQuery.mockImplementation(() => ({
      data: mockQueryData,
      loading: mockQueryLoading,
      error: mockQueryError,
      refetch: vi.fn(),
    }));
    usePublicAccountIdentity.mockReset();
    usePublicAccountIdentity.mockImplementation(() => {
      const result = mockUseQuery();
      const account = result.data?.accounts?.[0];
      return { usernameKey: mockUsername.trim().toLowerCase(), status: account ? "ready" : result.loading ? "loading" : "terminal-error", ...(account ? { account } : {}) };
    });
  });

  const renderWithPath = (pathname: string) => {
    mockLocationPathname = pathname;
    return render(
      <UsernameValidator>
        <div>Public profile route</div>
      </UsernameValidator>,
    );
  };

  it.each([
    "/tk2727",
    "/tk2727/places",
    "/tk2727/places/top-beach",
    "/tk2727/places/hello%20world",
    "/tk2727/places/hello-world/map",
    "/tk2727/music",
    "/tk2727/guides",
    "/tk2727/movies",
    "/tk2727/books",
    "/tk2727/books/subject/recommendation-hub",
    "/tk2727/games",
    "/tk2727/games/genre/indie",
    "/tk2727/apps",
    "/tk2727/apps/feature-spotlight",
    "/tk2727/products",
    "/tk2727/products/recommendations",
    "/tk2727/people",
    "/tk2727/people/sector/tech",
    "/tk2727/places/hello-world/placesmap",
  ])("allows valid profile route %s", (pathname) => {
    renderWithPath(pathname);

    expect(screen.getByText("Public profile route")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("canonicalizes a trailing-space username segment", () => {
    mockUsername = "tk2727 ";
    renderWithPath("/tk2727%20");

    expect(screen.queryByText("Public profile route")).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: "/tk2727", search: "", hash: "" },
      { replace: true },
    );
  });

  it("canonicalizes a trailing slash", () => {
    renderWithPath("/tk2727/");
    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: "/tk2727", search: "", hash: "" },
      { replace: true },
    );
    expect(screen.queryByText("Public profile route")).not.toBeInTheDocument();
  });

  it("reuses the shared account query with an exact lowercase username filter", () => {
    mockUsername = "TK2727";
    renderWithPath("/TK2727");

    expect(usePublicAccountIdentity).toHaveBeenCalled();
  });

  it("replace-redirects a valid case variant to the canonical username without changing the rest, search, or hash", () => {
    mockUsername = "TK2727";
    mockLocationSearch = "?utm_source=proof";
    mockLocationHash = "#section";

    renderWithPath("/TK2727/Books/reading-list");

    expect(mockNavigate).toHaveBeenCalledWith(
      {
        pathname: "/tk2727/Books/reading-list",
        search: mockLocationSearch,
        hash: mockLocationHash,
      },
      { replace: true },
    );
    expect(screen.queryByText("Public profile route")).not.toBeInTheDocument();
  });

  it.each([
    "/tk2727/invalid",
    "/tk2727/places/hello/world", // too many dynamic segments
    "/tk2727/places/a/b",
    "/tk2727/places/top/more",
    "/tk2727/products/slug/extra",
    "/tk2727/placeslug/slug",
    "/tk2727/community",
  ])("redirects invalid path %s to profile root", (pathname) => {
    renderWithPath(pathname);

    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: "/tk2727", search: "", hash: "" },
      { replace: true },
    );
  });

  it("preserves attribution parameters when redirecting an invalid child route", () => {
    mockLocationSearch =
      "?utm_source=newsletter&utm_medium=email&utm_campaign=launch";
    mockLocationHash = "#profile";

    renderWithPath("/tk2727/not-a-category");

    expect(mockNavigate).toHaveBeenCalledWith(
      {
        pathname: "/tk2727",
        search: mockLocationSearch,
        hash: mockLocationHash,
      },
      { replace: true },
    );
  });

  it("renders NotFound for missing account", () => {
    mockQueryData = { accounts: [] };

    renderWithPath("/tk2727");

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Page Not Found")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it.each([
    { label: "missing account", data: { accounts: [] }, error: undefined },
    { label: "query error", data: undefined, error: new Error("account lookup failed") },
  ])("renders NotFound for $label even when the requested child path is invalid", ({ data, error }) => {
    mockQueryData = data as typeof mockQueryData;
    mockQueryError = error;

    renderWithPath("/tk2727/not-a-category");

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Page Not Found")).toBeInTheDocument();
    expect(screen.queryByText("Public profile route")).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(coldReports.reportValidation).toHaveBeenCalledWith("terminal-invalid");
  });

  it.each([false, true])("keeps a matching cached account valid when background revalidation errors (loading=%s)", (loading) => {
    mockQueryLoading = loading;
    mockQueryError = new Error("background refresh failed");

    renderWithPath("/tk2727/books");

    expect(screen.getByText("Public profile route")).toBeInTheDocument();
    expect(screen.queryByText("404")).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(coldReports.reportValidation).toHaveBeenCalledWith("valid");
    expect(coldReports.reportValidation).not.toHaveBeenCalledWith("terminal-invalid");
  });

  it("handles loading state without redirecting", () => {
    mockQueryLoading = true;
    mockQueryData = { accounts: [] };

    renderWithPath("/tk2727");

    expect(screen.queryByText("Public profile route")).not.toBeInTheDocument();
    expect(document.querySelector(".earth-loader-wrapper")).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
