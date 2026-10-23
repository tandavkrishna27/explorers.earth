import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { explorersApiClient } from "../explorersApiClient";
import useAuthStore from "../../store/store";
import type { CreateCollectionInput } from "../../../../tunes/shared/explorersContract";

// WP10 (LNK-06). Create-and-attach keeps the guarded-parent custody that the retired
// Places-only linked create used: the host must be an issued observation, and the
// receipt must name that host.
const account = "00000000-0000-4000-8000-000000000301", hostId = "00000000-0000-4000-8000-000000000302", childId = "00000000-0000-4000-8000-000000000303";
const input = { category: "books", title: "Reads", slug: "reads", visibility: "private", publicationState: "draft" } as CreateCollectionInput;
const core = { id: childId, accountId: account, category: "books", title: "Reads", slug: "reads", visibility: "private", publicationState: "draft", revision: 1, description: null, heading: null, coverMediaId: null };
const host = { id: hostId, accountId: account, category: "guides", title: "Trip", slug: "trip", visibility: "private", publicationState: "draft", revision: 4, description: null, heading: null, coverMediaId: null,
  archived: false, displayOrder: 0, pinOrder: null, categoryRevision: "21", linkedLists: [] };
const posts: unknown[] = [];
let receipt: unknown;
function signIn() {
  const generation = useAuthStore.getState().beginVerification();
  useAuthStore.getState().acceptVerified(generation, { id: account, userId: "user", username: "owner", email: "owner@example.invalid", onboardingStatus: "complete", revision: 1 });
}
beforeEach(() => {
  useAuthStore.getState().logout(); signIn(); posts.length = 0;
  receipt = { collection: { ...core, attachedTo: { hostCollectionId: hostId, linkId: "00000000-0000-4000-8000-000000000304", hostCategoryRevision: 22 } } };
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit = {}) => {
    if (init.method === "POST") { posts.push(JSON.parse(String(init.body))); return new Response(JSON.stringify(receipt), { status: 201 }); }
    return new Response(JSON.stringify({ collection: host }), { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout(); });

it("derives attachTo from the issued host observation and its category revision", async () => {
  const observed = await explorersApiClient.getMyEditableCollection(hostId);
  const result = await explorersApiClient.createMyCollection(input, "attach-key", undefined, observed);
  expect(posts[0]).toMatchObject({ attachTo: { hostCollectionId: hostId, expectedHostRevision: 21, role: null } });
  expect(result.attachedTo?.hostCollectionId).toBe(hostId);
});

it("refuses attachTo without an issued host, or naming another host, before posting", async () => {
  await expect(explorersApiClient.createMyCollection({ ...input, attachTo: { hostCollectionId: hostId, expectedHostRevision: 21, role: null } }, "raw-key")).rejects.toMatchObject({ status: 422 });
  const observed = await explorersApiClient.getMyEditableCollection(hostId);
  await expect(explorersApiClient.createMyCollection({ ...input, attachTo: { hostCollectionId: childId, expectedHostRevision: 21, role: null } }, "wrong-key", undefined, observed)).rejects.toMatchObject({ status: 422 });
  expect(posts).toHaveLength(0);
});

it("refuses a receipt that does not name the host, and an attach receipt for a plain create", async () => {
  const observed = await explorersApiClient.getMyEditableCollection(hostId);
  const attachReceipt = receipt;
  receipt = { collection: core };
  await expect(explorersApiClient.createMyCollection(input, "missing-receipt", undefined, observed)).rejects.toMatchObject({ status: 503 });
  receipt = attachReceipt;
  await expect(explorersApiClient.createMyCollection(input, "plain-key")).rejects.toMatchObject({ status: 503 });
});
