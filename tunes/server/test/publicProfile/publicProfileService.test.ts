import { describe, expect, it, vi } from "vitest";
import { PublicProfileService } from "../../publicProfile/publicProfileService";

describe("PublicProfileService", () => {
  it("does not return a category when its profile visibility is disabled", async () => {
    const gateway = { resolveAccount: vi.fn().mockResolvedValue({ public_profile: "Yes", public_apps: "No" }), resolveCategory: vi.fn() };
    const service = new PublicProfileService(gateway);
    await expect(service.category("tk2727", "apps", 12)).resolves.toBeUndefined();
    expect(gateway.resolveCategory).not.toHaveBeenCalled();
  });

  it("uses a bounded short-lived cache for repeated public reads", async () => {
    let now = 1_000;
    const gateway = {
      resolveAccount: vi.fn().mockResolvedValue({ public_profile: "Yes", public_apps: "Yes" }),
      resolveCategory: vi.fn().mockResolvedValue({ appLists: [] }),
    };
    const service = new PublicProfileService(gateway, { now: () => now, ttlMs: 30_000 });
    await service.category("tk2727", "apps", 12);
    await service.category("tk2727", "apps", 12);
    expect(gateway.resolveAccount).toHaveBeenCalledTimes(1);
    expect(gateway.resolveCategory).toHaveBeenCalledTimes(1);
    now += 30_001;
    await service.category("tk2727", "apps", 12);
    expect(gateway.resolveCategory).toHaveBeenCalledTimes(2);
  });

  it("refreshes a public read when the creator requests no-cache", async () => {
    const gateway = {
      resolveAccount: vi.fn().mockResolvedValue({ public_profile: "Yes", public_apps: "Yes" }),
      resolveCategory: vi.fn().mockResolvedValue({ appLists: [] }),
    };
    const service = new PublicProfileService(gateway);
    await service.category("tk2727", "apps", 12);
    await service.category("tk2727", "apps", 12, { bypassCache: true });
    expect(gateway.resolveCategory).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent identical reads so a popular profile does not stampede Strapi", async () => {
    let releaseAccount: ((value: Record<string, unknown>) => void) | undefined;
    let releaseCategory: ((value: { appLists: never[] }) => void) | undefined;
    const gateway = {
      resolveAccount: vi.fn(() => new Promise<Record<string, unknown>>((resolve) => { releaseAccount = resolve; })),
      resolveCategory: vi.fn(() => new Promise<{ appLists: never[] }>((resolve) => { releaseCategory = resolve; })),
    };
    const service = new PublicProfileService(gateway);

    const first = service.category("tk2727", "apps", 12);
    const second = service.category("tk2727", "apps", 12);
    expect(gateway.resolveAccount).toHaveBeenCalledTimes(1);
    releaseAccount?.({ public_profile: "Yes", public_apps: "Yes" });
    await vi.waitFor(() => expect(gateway.resolveCategory).toHaveBeenCalledTimes(1));
    releaseCategory?.({ appLists: [] });

    await expect(Promise.all([first, second])).resolves.toEqual([{ appLists: [] }, { appLists: [] }]);
  });
});
