import type { Page } from "@playwright/test";
import { completeMusicAccount } from "./music";

export interface MusicAuthTriggerOptions {
  provider?: "local" | "google";
  confirmed?: boolean;
  accounts?: Array<Record<string, unknown>>;
}

const user = {
  id: "auth-trigger-user-id",
  documentId: "auth-trigger-user-document",
  username: "riverstone",
  email: "auth-trigger@example.invalid",
  blocked: false,
};

export async function installMusicAuthTriggerHarness(page: Page, options: MusicAuthTriggerOptions = {}) {
  const applicationToken = options.provider === "google" ? "google-callback-jwt" : "confirmed-email-jwt";
  const musicCredential = "auth-trigger-owner-music-credential";
  let accounts = (options.accounts ?? []).map((account) => ({ ...account }));
  let ensureCalls = 0;
  let createAccountCalls = 0;
  let accountCheckCalls = 0;
  let eligibilityQueries = 0;
  const ensures: Array<{ body: string | null; authorization?: string; xUsername?: string }> = [];
  const ownerRequests: Array<{ authorization?: string; xUsername?: string }> = [];
  const createdAccounts: Array<Record<string, unknown>> = [];

  // The journey is about local identity authority, not an external Maps account.
  // Keep the address fields in their supported manual-entry mode so a delayed
  // third-party script response cannot remount the onboarding form mid-flight.
  await page.route("https://maps.googleapis.com/maps/api/js**", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.google={maps:{importLibrary:async()=>({Autocomplete:class{addListener(){return{remove(){}}}getPlace(){return null}}}),event:{clearInstanceListeners(){}}}};",
  }));

  await page.route("**/api/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(user),
    });
  });

  await page.route("**/graphql", async (route) => {
    const payload = route.request().postDataJSON() as { query?: string; operationName?: string; variables?: Record<string, unknown> };
    const query = payload.query ?? "";
    if (/mutation\s+login\b/i.test(query)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { login: { jwt: applicationToken, user } } }),
      });
      return;
    }
    if (/mutation\s+createAccount\b/i.test(query)) {
      createAccountCalls += 1;
      const input = (payload.variables?.data ?? {}) as Record<string, unknown>;
      createdAccounts.push(input);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
      const created = {
        ...completeMusicAccount,
        documentId: "auth-trigger-account-document",
        Account_Name: input.Account_Name,
        Account_Type: input.Account_Type,
        username: input.username,
        Bio: input.Bio,
        Addresss: input.Addresss,
        mobile_number: input.mobile_number,
        Primary_Address: input.Primary_Address,
      };
      accounts = [created];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { createAccount: created } }) });
      return;
    }
    if (query.includes("updateUsersPermissionsUser")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { updateUsersPermissionsUser: { data: { ...user, is_subscribed: true } } } }),
      });
      return;
    }
    if (query.includes("MusicIdentityEligibility")) eligibilityQueries += 1;
    if (query.includes("usersPermissionsUser")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { usersPermissionsUser: {
          __typename: "UsersPermissionsUser",
          ...user,
          provider: options.provider ?? "local",
          confirmed: options.confirmed ?? true,
          accounts,
        } } }),
      });
      return;
    }
    if (query.includes("accounts")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { accounts: [] } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) });
  });

  await page.route(/\/accounts(?:\?|$)/, (route) => {
    accountCheckCalls += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });
  await page.route("**/api/subscriptions/plans", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data: [{
      documentId: "auth-trigger-free-plan",
      plan_name: "Free",
      cost: "0",
      songs_quota: "10",
      ai_guide_quota: "10",
      features: [],
      duration: "monthly",
      plan_code: "free",
      feature_control: {},
      max_devices: 1,
    }] }),
  }));
  await page.route("**/api/subscriptions/user-plans", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { documentId: "user-plan" } }),
  }));
  await page.route("**/api/subscriptions/song-limits/**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [] }),
  }));
  await page.route("**/api/subscriptions/song-limits", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { documentId: "song-limit" } }),
  }));

  await page.route("**/api/music/identity/ensure", async (route) => {
    ensureCalls += 1;
    ensures.push({
      body: route.request().postData(),
      authorization: route.request().headers().authorization,
      xUsername: route.request().headers()["x-username"],
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ credential: { token: musicCredential, expiresAt: Date.now() + 600_000 } }),
    });
  });
  await page.route("**/api/playlists", async (route) => {
    ownerRequests.push({
      authorization: route.request().headers().authorization,
      xUsername: route.request().headers()["x-username"],
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/music/dashboard", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      queueRevision: 0,
      songs: [],
      currentlyPlaying: null,
      playedSongs: [],
      publication: { mode: "private", publicSlug: "auth-trigger-public" },
      guestControls: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: false, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false },
    }),
  }));
  await page.route("**/api/music/entitlement", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ state: "included", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 }),
  }));
  await page.route("**/api/music/features", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ownerWorkspace: false, guestWorkspace: false, playlistImports: false, exposureId: "auth-trigger", expiresAt: new Date(Date.now() + 600_000).toISOString() }),
  }));

  return {
    applicationToken,
    musicCredential,
    ensureCalls: () => ensureCalls,
    createAccountCalls: () => createAccountCalls,
    accountCheckCalls: () => accountCheckCalls,
    eligibilityQueries: () => eligibilityQueries,
    accounts: () => accounts,
    ensures,
    ownerRequests,
    createdAccounts,
  };
}
