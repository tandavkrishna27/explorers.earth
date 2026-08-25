import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CookieConsent from "../CookieConsent";
import { loadAnalytics } from "../../../../utils/analytics";

vi.mock("../../../../utils/analytics", () => ({ loadAnalytics: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("CookieConsent public navigation clearance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reserves the public-navigation area on username routes", () => {
    render(
      <MemoryRouter initialEntries={["/tk2727/places"]}>
        <CookieConsent />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByTestId("cookie-consent-positioner")).toHaveClass(
      "bottom-16",
    );
    expect(screen.getByTestId("cookie-consent-positioner")).not.toHaveClass(
      "sm:bottom-0",
    );
  });

  it("keeps the banner at the viewport edge on dashboard routes", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <CookieConsent />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByTestId("cookie-consent-positioner")).toHaveClass(
      "bottom-3",
      "sm:bottom-0",
    );
  });

  it.each([
    "/analytics",
    "/instagram",
    "/login",
    "/forgot-password",
    "/onboarding",
    "/claimaccount",
    "/contact",
    "/use-cases",
    "/cookies",
    "/sso/tunes",
    "/reactivate",
    "/reactivate-confirm",
  ])(
    "does not classify %s as a public username route",
    (path) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <CookieConsent />
        </MemoryRouter>,
      );

      act(() => {
        vi.advanceTimersByTime(2_000);
      });

      expect(screen.getByTestId("cookie-consent-positioner")).toHaveClass(
        "bottom-3",
        "sm:bottom-0",
      );
    },
  );

  it("exposes preference toggles as named switches with their state", () => {
    render(
      <MemoryRouter initialEntries={["/tk2727"]}>
        <CookieConsent />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByRole("button", { name: /customize/i }));

    const analytics = screen.getByRole("switch", {
      name: "cookieConsent.analyticsCookies.title",
    });
    const marketing = screen.getByRole("switch", {
      name: "cookieConsent.marketingCookies.title",
    });
    expect(analytics).toHaveAttribute("aria-checked", "false");
    expect(marketing).toHaveAttribute("aria-checked", "false");
    expect(analytics).toHaveClass("min-h-11", "min-w-11");
  });

  it("keeps analytics fail-closed when consent storage throws", () => {
    render(
      <MemoryRouter initialEntries={["/tk2727"]}>
        <CookieConsent />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(2_000));
    fireEvent.click(screen.getByRole("button", { name: /customize/i }));
    fireEvent.click(
      screen.getByRole("switch", {
        name: "cookieConsent.analyticsCookies.title",
      }),
    );
    vi.mocked(loadAnalytics).mockClear();
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    fireEvent.click(
      screen.getByRole("button", { name: "cookieConsent.savePreferences" }),
    );

    expect(loadAnalytics).not.toHaveBeenCalled();
  });
});
