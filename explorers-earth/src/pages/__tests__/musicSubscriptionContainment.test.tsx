import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SubscriptionPlans from "../SubscriptionPlans";
import Checkout from "../Checkout";

const toastSpy = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }));
const subscriptionSpies = vi.hoisted(() => ({
  getSubscriptionPlanById: vi.fn(),
  getSubscriptionPlans: vi.fn(),
  getUserSubscriptionPlans: vi.fn(),
  getSongLimits: vi.fn(),
  updateSongLimit: vi.fn(),
  createSongLimit: vi.fn(),
  createUserSubscriptionPlan: vi.fn(),
}));

vi.mock("../../services/subscriptionService", () => subscriptionSpies);
vi.mock("../../store/store", () => ({
  default: () => ({ user: { id: 41, documentId: "explorer-41", username: "owner" } }),
}));
vi.mock("sonner", () => ({ toast: toastSpy }));

function renderContainedPage(element: React.ReactNode, entry: any = "/subscription-plans") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <MockedProvider>
        <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>
      </MockedProvider>
    </MemoryRouter>
  );
}

describe("contained Music subscription screens", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders an intentional unavailable state without loading subscription or quota APIs", async () => {
    renderContainedPage(<SubscriptionPlans />);

    expect(await screen.findByRole("heading", { name: /music subscriptions unavailable/i })).toBeInTheDocument();
    for (const service of Object.values(subscriptionSpies)) expect(service).not.toHaveBeenCalled();
  });

  it("gates checkout before payment or subscription actions can invoke contained APIs", async () => {
    renderContainedPage(<Checkout />, {
      pathname: "/checkout",
      state: { plan: { documentId: "plan-a", plan_name: "Plan A", cost: "10", duration: "monthly" } },
    });

    expect(await screen.findByRole("heading", { name: /music subscriptions unavailable/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay|subscribe|checkout/i })).not.toBeInTheDocument();
    for (const service of Object.values(subscriptionSpies)) expect(service).not.toHaveBeenCalled();
  });
});
