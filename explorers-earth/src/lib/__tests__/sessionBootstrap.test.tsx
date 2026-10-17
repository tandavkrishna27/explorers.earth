import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../../store/store";
import { resetSessionBootstrapForTests, useSessionBootstrap } from "../sessionBootstrap";

const calls = vi.hoisted(() => ({ refresh: vi.fn(async () => undefined) }));
vi.mock("../authClient", () => ({ authClient: { refresh: calls.refresh } }));

function Gate() {
  useSessionBootstrap();
  const status = useAuthStore(state => state.status);
  return <p>status:{status}</p>;
}

const mountGate = () => render(
  <MemoryRouter initialEntries={["/login"]}>
    <Routes><Route path="/login" element={<Gate />} /></Routes>
  </MemoryRouter>,
);

describe("session bootstrap", () => {
  // logout() settles the store, which is not a cold load. A real page load starts at
  // "loading", which is the only state the bootstrap acts on.
  beforeEach(() => { vi.clearAllMocks(); resetSessionBootstrapForTests(); useAuthStore.getState().logout(); useAuthStore.setState({ status: "loading" }); });

  // The negative half lives in AuthSyncManager.test.tsx: a visitor who gates on nothing
  // issues no auth request. This is the half that would silently disappear if the
  // bootstrap were skipped in the wrong place, leaving nobody signed in.
  it("bootstraps where a surface gates on auth status", async () => {
    mountGate();
    await waitFor(() => expect(calls.refresh).toHaveBeenCalledTimes(1));
  });

  // Two gates can mount in the same commit. A per-component ref would let both fire.
  it("bootstraps once per page load even with two gates mounted", async () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes><Route path="/login" element={<><Gate /><Gate /></>} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(calls.refresh).toHaveBeenCalledTimes(1));
  });

  // The failure this guards is the one that is invisible to the e2e counter: a gate that
  // renders a loader for "loading" and never ends it leaves the page spinning forever.
  it("never leaves a gating surface on a non-terminal status", async () => {
    calls.refresh.mockImplementation(async () => {
      const store = useAuthStore.getState();
      store.verificationFailed(store.beginVerification(), "signed-out");
    });
    mountGate();
    await waitFor(() => expect(useAuthStore.getState().status).not.toBe("loading"));
    expect(useAuthStore.getState().status).toBe("signed-out");
  });

  it("does not bootstrap again when a gate remounts", async () => {
    const first = mountGate();
    await waitFor(() => expect(calls.refresh).toHaveBeenCalledTimes(1));
    first.unmount();
    mountGate();
    await waitFor(() => expect(calls.refresh).toHaveBeenCalledTimes(1));
  });
});
