import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import useAuthStore from "../../store/store";
import ProtectedRoute from "../ProtectedRoute";

const query = vi.hoisted(() => ({ current: { data: { id: "account-a", onboardingStatus: "complete" },
  isLoading: false, error: null as Error | null, refetch: vi.fn() } }));
vi.mock("../../features/Profile/api/useCanonicalAccount", () => ({
  useCanonicalAccount: vi.fn(() => query.current),
}));
vi.mock("../EarthLoader", () => ({ EarthLoader: () => <div>LOADING</div> }));
vi.mock("../../hooks/useLogout", () => ({ useLogout: () => vi.fn() }));

const signIn = () => useAuthStore.setState({ isAuthenticated: true, status: "active-complete",
  user: { id: "user-a", documentId: "user-a", username: "google-name",
    email: "a@example.invalid", blocked: false }, token: "fixture" });
const mount = (path = "/home") => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route element={<ProtectedRoute />}>
    <Route path="/home" element={<div>PROTECTED HOME</div>} />
    <Route path="/onboarding" element={<div>ONBOARDING PAGE</div>} />
  </Route>
  <Route path="/login" element={<div>LOGIN PAGE</div>} />
</Routes></MemoryRouter>);

describe("ProtectedRoute canonical onboarding gate", () => {
  beforeEach(() => {
    vi.clearAllMocks(); signIn();
    query.current = { data: { id: "account-a", onboardingStatus: "complete" },
      isLoading: false, error: null, refetch: vi.fn() };
  });

  it("redirects anonymous users to login", () => {
    useAuthStore.setState({ isAuthenticated: false, user: null, token: null });
    mount();
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
  });

  it("does not render owner content from a stale local authentication flag", () => {
    useAuthStore.setState({ isAuthenticated: true, status: "signed-out", token: "old-jwt" });
    mount();
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED HOME")).toBeNull();
  });

  it("waits for authoritative account data", () => {
    query.current = { data: undefined as any, isLoading: true, error: null, refetch: vi.fn() };
    mount();
    expect(screen.getByText("LOADING")).toBeInTheDocument();
    expect(screen.queryByText("ONBOARDING PAGE")).toBeNull();
  });

  it("uses canonical completion instead of Google or legacy profile fields", () => {
    mount();
    expect(screen.getByText("PROTECTED HOME")).toBeInTheDocument();
  });

  it("redirects an incomplete canonical account to onboarding", () => {
    query.current = { data: { id: "account-a", onboardingStatus: "incomplete" },
      isLoading: false, error: null, refetch: vi.fn() };
    mount();
    expect(screen.getByText("ONBOARDING PAGE")).toBeInTheDocument();
  });

  it("keeps failed owner reads in a recoverable retry state", () => {
    query.current = { data: undefined as any, isLoading: false, error: new Error("offline"), refetch: vi.fn() };
    mount();
    expect(screen.queryByText("ONBOARDING PAGE")).toBeNull();
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.getByText("Log out")).toBeInTheDocument();
  });

  it("does not trust cached completion when the canonical read errors", () => {
    query.current = { data: { id: "account-a", onboardingStatus: "complete" },
      isLoading: false, error: new Error("offline"), refetch: vi.fn() };
    mount();
    expect(screen.queryByText("PROTECTED HOME")).toBeNull();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });
});
