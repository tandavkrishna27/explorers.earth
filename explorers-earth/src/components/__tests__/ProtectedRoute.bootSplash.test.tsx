import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import useAuthStore from "../../store/store";
import ProtectedRoute from "../ProtectedRoute";

vi.mock("../../hooks/useLogout", () => ({ useLogout: () => vi.fn() }));
vi.mock("../../lib/sessionBootstrap", () => ({ useSessionBootstrap: () => undefined }));
vi.mock("../../features/Profile/api/useCanonicalAccount", () => ({ useCanonicalAccount: () => ({ isLoading: false }) }));
vi.mock("../EarthLoader", () => ({
  BootSplash: () => <div role="status" aria-label="Earth loading" data-loader-owner="boot" />,
  EarthLoader: () => <div role="status" aria-label="Earth loading" data-loader-owner="other" />,
}));

describe("ProtectedRoute loader", () => {
  it("uses the boot splash while the session loads", () => {
    useAuthStore.setState({ status: "loading", isAuthenticated: false });
    render(<MemoryRouter initialEntries={["/home"]}><Routes><Route element={<ProtectedRoute />}><Route path="home" element={<p>Home</p>} /></Route></Routes></MemoryRouter>);
    expect(screen.getByRole("status", { name: "Earth loading" })).toHaveAttribute("data-loader-owner", "boot");
  });
});
