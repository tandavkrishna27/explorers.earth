import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CookieConsent from "../CookieConsent";
import * as analytics from "../../../../utils/analytics";
import { ANALYTICS_CONSENT_CHANGED_EVENT } from "../../../../services/explorersAnalyticsClient";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("CookieConsent public navigation clearance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    delete window.gtag;
    delete window.clarity;
    window.dataLayer = [];
    document.querySelectorAll('#ga-script, #clarity-script').forEach((script) => script.remove());
    vi.spyOn(analytics, 'loadAnalytics'); // Call through to actual vendor insertion.
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.querySelectorAll('#ga-script, #clarity-script').forEach((script) => script.remove());
    delete window.gtag;
    delete window.clarity;
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
    vi.mocked(analytics.loadAnalytics).mockClear();
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    fireEvent.click(
      screen.getByRole("button", { name: "cookieConsent.savePreferences" }),
    );

    expect(analytics.loadAnalytics).not.toHaveBeenCalled();
  });

  it.each([
    ['accept', true, true],
    ['reject', false, false],
    ['custom analytics', true, false],
    ['custom marketing', false, true],
    ['custom neither', false, false],
  ] as const)('persists %s before the event and initializes only with analytics opt-in', (choice, analyticsOn, marketingOn) => {
    const eventSnapshots: unknown[] = [];
    const scriptSnapshots: unknown[] = [];
    const recordEvent = () => eventSnapshots.push(JSON.parse(localStorage.getItem('explorers-cookie-consent')!));
    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, recordEvent);
    const append = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLScriptElement) scriptSnapshots.push(JSON.parse(localStorage.getItem('explorers-cookie-consent')!));
      return append(node);
    });
    try {
      render(<MemoryRouter initialEntries={['/']}><CookieConsent /></MemoryRouter>);
      act(() => vi.advanceTimersByTime(2_000));
      if (choice.startsWith('custom')) {
        fireEvent.click(screen.getByRole('button', { name: 'cookieConsent.customize' }));
        if (analyticsOn) fireEvent.click(screen.getByRole('switch', { name: 'cookieConsent.analyticsCookies.title' }));
        if (marketingOn) fireEvent.click(screen.getByRole('switch', { name: 'cookieConsent.marketingCookies.title' }));
        fireEvent.click(screen.getByRole('button', { name: 'cookieConsent.savePreferences' }));
      } else {
        fireEvent.click(screen.getByRole('button', { name: choice === 'accept' ? 'cookieConsent.acceptAll' : 'cookieConsent.rejectNonEssential' }));
      }
      const expected = { essential: true, analytics: analyticsOn, marketing: marketingOn, timestamp: new Date().toISOString() };
      expect(JSON.parse(localStorage.getItem('explorers-cookie-consent')!)).toEqual(expected);
      expect(eventSnapshots).toEqual([expected]);
      expect(scriptSnapshots).toEqual(analyticsOn ? [expected, expected] : []);
      expect(document.querySelectorAll('#ga-script, #clarity-script')).toHaveLength(analyticsOn ? 2 : 0);
      expect(screen.queryByTestId('cookie-consent-positioner')).not.toBeInTheDocument();
    } finally {
      window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, recordEvent);
    }
  });

  it.each(['close', 'failed accept', 'failed custom'] as const)('%s never persists, emits a consent event, or initializes vendors', (choice) => {
    const consentEvent = vi.fn();
    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, consentEvent);
    try {
      render(<MemoryRouter initialEntries={['/']}><CookieConsent /></MemoryRouter>);
      act(() => vi.advanceTimersByTime(2_000));
      const store = vi.spyOn(window.localStorage, 'setItem');
      if (choice !== 'close') store.mockImplementation(() => { throw new Error('denied'); });
      if (choice === 'failed custom') {
        fireEvent.click(screen.getByRole('button', { name: 'cookieConsent.customize' }));
        fireEvent.click(screen.getByRole('switch', { name: 'cookieConsent.analyticsCookies.title' }));
        fireEvent.click(screen.getByRole('button', { name: 'cookieConsent.savePreferences' }));
      } else {
        fireEvent.click(screen.getByRole('button', { name: choice === 'close' ? 'cookieConsent.closeBanner' : 'cookieConsent.acceptAll' }));
      }
      if (choice === 'close') expect(store).not.toHaveBeenCalled();
      else expect(store).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('explorers-cookie-consent')).toBeNull();
      expect(consentEvent).not.toHaveBeenCalled();
      expect(analytics.loadAnalytics).not.toHaveBeenCalled();
      expect(document.querySelectorAll('#ga-script, #clarity-script')).toHaveLength(0);
    } finally {
      window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, consentEvent);
    }
  });

  it.each(['{bad', 'null', '{"analytics":"false"}', '{"analytics":1}'])('does not treat invalid saved consent as analytics permission: %s', (stored) => {
    localStorage.setItem('explorers-cookie-consent', stored);
    render(<MemoryRouter initialEntries={['/']}><CookieConsent /></MemoryRouter>);
    act(() => vi.advanceTimersByTime(2_000));
    expect(analytics.loadAnalytics).not.toHaveBeenCalled();
    expect(document.querySelectorAll('#ga-script, #clarity-script')).toHaveLength(0);
  });
});
