import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import UsernameValidator from "../validators/UsernameValidator";

const mockNavigate = vi.fn();
let mockLocationPathname = "/tk2727";
let mockLocationSearch = "";
let mockLocationHash = "";
let mockUsername = "tk2727";
let mockQueryData = {
  accounts: [{ documentId: "acct-1", Account_Name: "Demo User" }],
};
let mockQueryLoading = false;
let mockQueryError: Error | undefined;

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
    useQuery: () => ({
      data: mockQueryData,
      loading: mockQueryLoading,
      error: mockQueryError,
      refetch: vi.fn(),
    }),
  };
});

describe("UsernameValidator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryData = {
      accounts: [{ documentId: "acct-1", Account_Name: "Demo User" }],
    };
    mockQueryLoading = false;
    mockQueryError = undefined;
    mockUsername = "tk2727";
    mockLocationSearch = "";
    mockLocationHash = "";
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
    "/tk2727/",
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

  it("normalizes a trailing-space username segment", () => {
    mockUsername = "tk2727 ";
    renderWithPath("/tk2727%20");

    expect(screen.getByText("Public profile route")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
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

  it("handles loading state without redirecting", () => {
    mockQueryLoading = true;
    mockQueryData = { accounts: [] };

    renderWithPath("/tk2727");

    expect(screen.queryByText("Public profile route")).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
