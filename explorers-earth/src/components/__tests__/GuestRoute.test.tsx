import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GuestRoute from "../GuestRoute";
import useAuthStore from "../../store/store";

const mount = () => render(<MemoryRouter initialEntries={["/login"]}><Routes>
  <Route element={<GuestRoute />}><Route path="/login" element={<div>LOGIN</div>} /></Route>
  <Route path="/home" element={<div>HOME</div>} />
</Routes></MemoryRouter>);

describe("verified guest route", () => {
  beforeEach(() => { useAuthStore.getState().logout(); });
  it("waits for session verification instead of showing the login or home page", () => {
    useAuthStore.setState({ status: "loading", isAuthenticated: true });
    mount();
    expect(screen.queryByText("HOME")).toBeNull();
    expect(screen.queryByText("LOGIN")).toBeNull();
  });
  it("ignores stale persisted authentication when the verified state is signed out", () => {
    useAuthStore.setState({ status: "signed-out", isAuthenticated: true });
    mount();
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
  });
});
