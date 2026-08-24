import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return {
    ...actual,
    useMutation: () => [vi.fn()],
    useQuery: () => ({
      data: {
        usersPermissionsUser: { provider: "google" },
        accounts: [
          {
            documentId: "account-1",
            username: "tk2727",
            localtunes_integrated: "No",
            pinned_nav_tabs: [],
            auto_pinning: true,
          },
        ],
        recommendationLists: [],
        movieLists: [],
        bookLists: [],
        gameLists: [],
        appLists: [],
        productLists: [],
        personLists: [],
        guides: [],
      },
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    }),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
}));

vi.mock("../../../store/store", () => ({
  default: () => ({
    user: {
      id: "user-1",
      documentId: "user-doc",
      username: "tk2727",
      blocked: false,
    },
    logout: vi.fn(),
    updateUserBlocked: vi.fn(),
  }),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("../components/ProfileAccountSettings", () => ({
  default: ({ section }: { section: string }) => (
    <div data-testid={`moved-${section}`}>{section}</div>
  ),
}));
vi.mock("../components/BillingTab", () => ({
  default: () => <div data-testid="existing-billing">Existing billing</div>,
}));
vi.mock("../components/ConnectedAccounts", () => ({ default: () => null }));
vi.mock("../components/LanguageSelector", () => ({
  default: () => null,
  LANGUAGES: [
    { code: "en", name: "English", nativeName: "English", flag: "EN" },
  ],
}));

import Settings from "../Settings";

describe("Settings moved profile data placement", () => {
  it("places private identity in Account and billing address in Billing", () => {
    render(<Settings />);

    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("moved-account")).toBeInTheDocument();
    expect(screen.queryByTestId("moved-billing")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Billing" }));

    expect(screen.getByRole("tab", { name: "Billing" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("moved-billing")).toBeInTheDocument();
    expect(screen.getByTestId("existing-billing")).toBeInTheDocument();
    expect(screen.queryByTestId("moved-account")).not.toBeInTheDocument();
  });
});
