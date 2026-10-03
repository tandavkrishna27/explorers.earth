import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../../components/SEO", () => ({ default: () => null }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it("starts Google recovery without collecting an email address", async () => {
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    requests.push(input);
    return input.endsWith("/start") ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ url: "https://accounts.google.com/example" }), { status: 200 });
  }));
  const { default: Page } = await import("../ReactivateAccount");
  render(<MemoryRouter><Page /></MemoryRouter>);
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Google/i }));
  await waitFor(() => expect(requests).toEqual(["/api/explorers/v1/recovery/start", "/api/auth/sign-in/social"]));
});

it("ignores a legacy URL token and requires the cookie proof before submitting revision-bound recovery", async () => {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    requests.push({ url: input, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return input.endsWith("/status")
      ? new Response(JSON.stringify({ recovery: { status: "suspended", revision: 7 } }), { status: 200 })
      : new Response(JSON.stringify({ lifecycle: { status: "active", revision: 8 } }), { status: 200 });
  }));
  const { default: Page } = await import("../ReactivateConfirm");
  render(<MemoryRouter initialEntries={["/reactivate-confirm?token=untrusted"]}><Page /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("button", { name: /reactivate/i })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /reactivate/i }));
  await waitFor(() => expect(requests).toEqual([
    { url: "/api/explorers/v1/recovery/status", method: "GET" },
    { url: "/api/explorers/v1/recovery/complete", method: "POST", body: { expectedRevision: 7 } },
  ]));
});
