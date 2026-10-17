import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../../store/store";
import ProtectedRoute from "../ProtectedRoute";

const account = vi.hoisted(() => ({ status: "complete" as "complete" | "incomplete", loading: false, error: false }));
vi.mock("../../features/Profile/api/useCanonicalAccount", () => ({ useCanonicalAccount: () => ({
  data: account.error || account.loading ? undefined : { id: "current-account", onboardingStatus: account.status },
  isLoading: account.loading, error: account.error ? new Error("outage") : null, refetch: vi.fn(),
}) }));
vi.mock("../EarthLoader", () => ({ EarthLoader: () => <div>Verifying session</div> }));
vi.mock("../../hooks/useLogout", () => ({ useLogout: () => async () => useAuthStore.getState().logout() }));

function verify(id: string, complete = true) {
  const generation = useAuthStore.getState().beginVerification();
  useAuthStore.getState().acceptVerified(generation, { id, userId: `user-${id}`, username: id,
    email: `${id}@example.invalid`, onboardingStatus: complete ? "complete" : "incomplete", revision: 1 });
}
function mount(path = "/settings") {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<ProtectedRoute />}><Route path="/settings" element={<div>Private settings</div>} />
      <Route path="/onboarding" element={<div>Onboarding</div>} /></Route>
    <Route path="/login" element={<div>Login</div>} />
    <Route path="/reactivate" element={<div>Recovery</div>} />
    <Route path="/reactivate-confirm" element={<div>Confirm recovery</div>} />
  </Routes></MemoryRouter>);
}

describe("ProtectedRoute lifecycle identity", () => {
  beforeEach(() => { useAuthStore.getState().logout(); account.status = "complete"; account.loading = false; account.error = false; });
  afterEach(() => vi.restoreAllMocks());
  it("never renders private content while the session is being verified", () => {
    useAuthStore.getState().beginVerification();
    mount();
    expect(screen.queryByText("Private settings")).not.toBeInTheDocument();
    expect(screen.getByText("Verifying session")).toBeInTheDocument();
  });
  it("moves an inactive session to the purpose-bound recovery flow", () => {
    const generation = useAuthStore.getState().beginVerification();
    useAuthStore.getState().verificationFailed(generation, "recovery-only");
    mount();
    expect(screen.getByText("Confirm recovery")).toBeInTheDocument();
    expect(screen.queryByText("Private settings")).not.toBeInTheDocument();
  });
  it("removes private content synchronously when another session replaces it", () => {
    verify("account-a");
    mount();
    expect(screen.getByText("Private settings")).toBeInTheDocument();
    act(() => useAuthStore.getState().beginVerification());
    expect(screen.queryByText("Private settings")).not.toBeInTheDocument();
    expect(screen.getByText("Verifying session")).toBeInTheDocument();
  });
  it("keeps network failure retryable instead of assuming onboarding is incomplete", () => {
    const generation = useAuthStore.getState().beginVerification();
    useAuthStore.getState().verificationFailed(generation, "error");
    mount();
    expect(screen.queryByText("Onboarding")).not.toBeInTheDocument();
    expect(screen.queryByText("Private settings")).not.toBeInTheDocument();
  });
  it("never grants a stale profile response authority after logout", () => {
    verify("account-a"); account.loading = true;
    mount();
    act(() => useAuthStore.getState().logout());
    expect(screen.getByText("Login")).toBeInTheDocument();
    expect(screen.queryByText("Private settings")).not.toBeInTheDocument();
  });
});
