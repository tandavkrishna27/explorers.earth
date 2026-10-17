interface CredentialAuthority {
  generation: number;
  subject: string | undefined;
  explorerProof: string;
}

interface CachedMusicCredential extends CredentialAuthority { token: string; expiresAt: number; }
interface MusicCredentialFlight extends CredentialAuthority {
  controller: AbortController;
  promise: Promise<{ token: string; expiresAt: number }>;
}

let current: CachedMusicCredential | undefined;
let inflight: MusicCredentialFlight | undefined;
let authoritySubject: string | undefined;
let authorityGeneration = 0;
const GUEST_CAPABILITY_KEY_PREFIX = "musicGuestCapability:";
const GUEST_CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const GUEST_SLUG_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function guestCapabilityKey(guestUrl: string): string {
  if (!GUEST_SLUG_PATTERN.test(guestUrl)) throw new Error("A valid guest playlist slug is required.");
  return `${GUEST_CAPABILITY_KEY_PREFIX}${guestUrl}`;
}

export function clearMusicCredential(): void {
  authorityGeneration += 1;
  current = undefined;
  inflight?.controller.abort();
  inflight = undefined;
}

export function setMusicCredentialAuthority(subject: string | undefined): void {
  authoritySubject = subject;
  clearMusicCredential();
}

/** Accepts an out-of-band capability after the guest explicitly supplies it. */
export function setGuestMusicCapability(capability: string, guestUrl: string): void {
  if (!GUEST_CAPABILITY_PATTERN.test(capability)) throw new Error("A valid guest capability is required.");
  sessionStorage.setItem(guestCapabilityKey(guestUrl), capability);
}

export function getGuestMusicCapability(guestUrl: string): string | undefined {
  const key = guestCapabilityKey(guestUrl);
  const capability = sessionStorage.getItem(key) ?? "";
  if (!GUEST_CAPABILITY_PATTERN.test(capability)) {
    sessionStorage.removeItem(key);
    return undefined;
  }
  return capability;
}

export function clearGuestMusicCapability(guestUrl: string): void {
  sessionStorage.removeItem(guestCapabilityKey(guestUrl));
}

export function acquireGuestMusicCapability(guestUrl: string): string | undefined {
  return getGuestMusicCapability(guestUrl);
}

export class GuestCapabilityRequiredError extends Error {
  readonly name = "GuestCapabilityRequiredError";
  constructor(readonly guestUrl: string, message: string) {
    super(message);
  }
}

/** Creates the owner-to-guest handoff text. The capability is a body line, never URL material. */
export function guestCapabilityHandoff(capability: string, guestUrl: string, origin = window.location.origin): string {
  if (!GUEST_CAPABILITY_PATTERN.test(capability)) throw new Error("A valid guest capability is required.");
  guestCapabilityKey(guestUrl);
  const base = new URL(origin);
  if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw new Error("A valid Music origin is required.");
  }
  return `explorers-music-guest/v1\nURL: ${base.origin}/playlist/${encodeURIComponent(guestUrl)}\nGuest capability: ${capability}`;
}

/** Imports an out-of-band handoff into this tab's per-slug header authority. */
export function importGuestMusicCapability(handoff: string, expectedGuestUrl: string): string {
  guestCapabilityKey(expectedGuestUrl);
  const lines = handoff.trim().split(/\r?\n/);
  const capability = lines[2]?.replace(/^Guest capability: /, "") ?? "";
  try {
    if (lines.length !== 3 || lines[0] !== "explorers-music-guest/v1"
        || !lines[1]?.startsWith("URL: ") || !lines[2]?.startsWith("Guest capability: ")
        || !GUEST_CAPABILITY_PATTERN.test(capability)) throw new Error("invalid handoff");
    const url = new URL(lines[1].slice("URL: ".length));
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash
        || decodeURIComponent(url.pathname) !== `/playlist/${expectedGuestUrl}`) throw new Error("invalid handoff");
  } catch {
    throw new Error("A valid guest access handoff for this playlist is required.");
  }
  setGuestMusicCapability(capability, expectedGuestUrl);
  return capability;
}

export async function musicCredentialForRequest(now = Date.now()): Promise<string> {
  const explorerProof = localStorage.getItem("qrtoken");
  if (!explorerProof) throw new Error("Explorer authentication is required before Music access.");
  const authority = { generation: authorityGeneration, subject: authoritySubject, explorerProof };
  if (current && authorityMatches(current, authority) && current.expiresAt - now > 5_000) return current.token;
  if (inflight && !authorityMatches(inflight, authority)) {
    inflight.controller.abort();
    inflight = undefined;
  }
  if (!inflight) {
    const controller = new AbortController();
    inflight = {
      ...authority,
      controller,
      promise: mintMusicCredential(explorerProof, controller.signal),
    };
  }
  const flight = inflight;
  try {
    const credential = await flight.promise;
    if (!authorityIsCurrent(flight) || flight.controller.signal.aborted) throw staleMusicAuthority();
    current = { ...credential, generation: flight.generation, subject: flight.subject, explorerProof: flight.explorerProof };
    return credential.token;
  } catch (cause) {
    if (!authorityIsCurrent(flight) || flight.controller.signal.aborted) throw staleMusicAuthority();
    throw cause;
  } finally {
    if (inflight === flight) inflight = undefined;
  }
}

export async function musicPrincipalForRequest(): Promise<{ musicUserId: number; status: "active" }> {
  const token = await musicCredentialForRequest();
  const response = await fetch("/api/music/identity/current", {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  const body = await response.json();
  if (!response.ok || body?.version !== "music-principal/v1" || !Number.isSafeInteger(body?.identity?.musicUserId)
      || body.identity.musicUserId < 1 || body.identity.status !== "active") {
    throw new Error(body?.error?.message || "Music principal resolution failed.");
  }
  return body.identity;
}

async function mintMusicCredential(explorerProof: string, signal: AbortSignal): Promise<{ token: string; expiresAt: number }> {
  const response = await fetch("/api/music/identity/ensure", {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${explorerProof}` },
    body: undefined,
    credentials: "include",
    signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "Music authentication failed.");
  const token = body?.credential?.token;
  const expiresAt = body?.credential?.expiresAt;
  if (body?.version !== "music-identity/v1" || typeof token !== "string" || token.length < 64
      || token.length > 4_096 || token.split(".").length !== 3
      || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("Music authentication returned an invalid credential.");
  }
  return { token, expiresAt };
}

function authorityMatches(left: CredentialAuthority, right: CredentialAuthority): boolean {
  return left.generation === right.generation
    && left.subject === right.subject
    && left.explorerProof === right.explorerProof;
}

function authorityIsCurrent(authority: CredentialAuthority): boolean {
  return authority.generation === authorityGeneration
    && authority.subject === authoritySubject
    && localStorage.getItem("qrtoken") === authority.explorerProof;
}

function staleMusicAuthority(): Error {
  return new Error("Music authorization is required.");
}

export function isMusicOwnerRequest(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return path === "/api/music/identity/current"
    || path.startsWith("/api/playlists")
    || path.startsWith("/api/playlist/songs")
    || path.startsWith("/api/playlist/currently-playing")
    || path.startsWith("/api/playlist/history")
    || path.startsWith("/api/playlist/import-")
    || path === "/api/music/publication"
    || path.startsWith("/api/music/paid/")
    || path === "/api/music/dashboard"
    || path === "/api/music/entitlement"
    || path.startsWith("/api/user")
    || path.startsWith("/api/system-settings/")
    || path.startsWith("/api/youtube/")
    || path.startsWith("/api/instagram/")
    || path.startsWith("/api/payments/")
    || path.startsWith("/api/subscriptions/")
    || path.startsWith("/api/gemini/")
    || path.startsWith("/api/email/")
    || path === "/api/seo";
}

export async function guestMusicRequest(
  capability: string | undefined,
  song: { youtubeId: string; title: string; artist: string; thumbnailUrl: string },
  guestUrl: string,
): Promise<Response> {
  const normalizedCapability = capability || undefined;
  if (normalizedCapability !== undefined && !GUEST_CAPABILITY_PATTERN.test(normalizedCapability)) throw new Error("A valid guest capability is required.");
  if (!GUEST_SLUG_PATTERN.test(guestUrl)) throw new Error("A valid guest playlist slug is required.");
  return guestMusicFetch(normalizedCapability, guestUrl, "requests", song);
}

export async function guestMusicSearch(
  capability: string | undefined,
  input: { query: string; pageToken?: string },
  guestUrl: string,
): Promise<Response> {
  return guestMusicFetch(capability, guestUrl, "youtube/search", input);
}

export async function guestMusicVideoFromUrl(capability: string | undefined, url: string, guestUrl: string): Promise<Response> {
  return guestMusicFetch(capability, guestUrl, "youtube/video-from-url", { url });
}

async function guestMusicFetch(capability: string | undefined, guestUrl: string, operation: string, body: unknown): Promise<Response> {
  const normalizedCapability = capability || undefined;
  if (normalizedCapability !== undefined && !GUEST_CAPABILITY_PATTERN.test(normalizedCapability)) throw new Error("A valid guest capability is required.");
  if (!GUEST_SLUG_PATTERN.test(guestUrl)) throw new Error("A valid guest playlist slug is required.");
  const response = await fetch(`/api/playlist/${encodeURIComponent(guestUrl)}/${operation}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(normalizedCapability ? { "X-Music-Guest-Capability": normalizedCapability } : {}),
    },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (response.status === 403) {
    const denied = await response.json().catch(() => undefined);
    clearGuestMusicCapability(guestUrl);
    throw new GuestCapabilityRequiredError(guestUrl, denied?.error?.message || "Guest Music request failed.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new Error(body?.error?.message || "Guest Music request failed.");
  }
  return response;
}
