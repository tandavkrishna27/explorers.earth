import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UsernameValidator from "../validators/UsernameValidator";

const identity = vi.hoisted(() => vi.fn());
const refetch = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ username: "tk2727" }),
  useLocation: () => ({ pathname: "/tk2727", search: "", hash: "" }),
}));
vi.mock("../../layouts/PublicColdEntryBoundary", () => ({ usePublicColdEntry: () => ({ reportValidation: vi.fn() }) }));
vi.mock("../../features/PublicHome/api/PublicAccountIdentityProvider", () => ({ usePublicAccountIdentity: identity }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d }) }));
vi.mock("../../pages/NotFound", () => ({ default: () => <div>Page Not Found</div> }));

const failed = (error: unknown) => identity.mockReturnValue({ usernameKey: "tk2727", status: "terminal-error", error, refetch });

describe("UsernameValidator terminal errors (PUB-X01)", () => {
  beforeEach(() => { vi.clearAllMocks(); refetch.mockResolvedValue(undefined); });

  it("renders not-found only for a real 404", () => {
    failed(new Error("PUBLIC_PROFILE_404"));
    render(<UsernameValidator><div>child</div></UsernameValidator>);
    expect(screen.getByText("Page Not Found")).toBeTruthy();
  });

  it.each(["PUBLIC_PROFILE_429", "PUBLIC_PROFILE_503", "Failed to fetch"])("renders a retryable error, not not-found, for %s", async (message) => {
    failed(Object.assign(new Error(message), { retryAfterMs: 60_000 }));
    render(<UsernameValidator><div>child</div></UsernameValidator>);
    expect(screen.queryByText("Page Not Found")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });

  it("retries automatically after Retry-After", async () => {
    vi.useFakeTimers();
    try {
      failed(Object.assign(new Error("PUBLIC_PROFILE_429"), { retryAfterMs: 3_000 }));
      render(<UsernameValidator><div>child</div></UsernameValidator>);
      expect(refetch).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(3_100);
      expect(refetch).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
