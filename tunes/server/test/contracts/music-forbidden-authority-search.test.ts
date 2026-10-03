import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const ownerTargetAccess = /req\.(?:body|query|params)(?:\?\.)?\.(?:username|email|userId|musicUserId|ownerId|accountId|documentId)\b/;

function ownerAuthoritySource(file: string, source: string): string {
  if(file.replaceAll('\\','/')==='tunes/server/routes/explorersPublicContentRoutes.ts') {
    // Exactly one guest locator passed into the strict public service. Do not
    // mask a second occurrence, owner endpoint, body/query target or other source.
    return source.replace('service.page({...req.query,username:req.params.username,','service.page({...req.query,username:publicLocator,');
  }
  if (file.replaceAll("\\", "/") !== "tunes/server/routes/explorersPublicProfileRoutes.ts") return source;
  // These three parser inputs locate public resources. Mask only one exact
  // occurrence per reader, leaving the rest of the file and line scanned.
  return source
    .replace("parsePublicProfileUsername(req.params.username)", "parsePublicProfileUsername(publicLocator)")
    .replace("parsePublicProfileRequest({ username: req.params.username,", "parsePublicProfileRequest({ username: publicLocator,")
    .replace("parsePublicProfileDetailRequest({ username: req.params.username,", "parsePublicProfileDetailRequest({ username: publicLocator,");
}

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ["node_modules", "test", "__tests__"].includes(entry.name) ? [] : productionFiles(path);
    return [".ts", ".tsx", ".js"].includes(extname(entry.name)) && !/\.(?:test|spec)\./.test(entry.name) ? [path] : [];
  });
}

function matches(files: string[], expression: RegExp) {
  return files.flatMap((file) => readFileSync(file, "utf8").split(/\r?\n/).flatMap((line, index) => {
    expression.lastIndex = 0;
    return expression.test(line) ? [`${relative(root, file)}:${index + 1}`] : [];
  }));
}

describe("forbidden Music authority search contract", () => {
  it('permits one validated public content locator while retaining every owner selector check',()=>{
    const file='tunes/server/routes/explorersPublicContentRoutes.ts';
    const locator='service.page({...req.query,username:req.params.username,';
    expect(ownerAuthoritySource(file,locator)).not.toMatch(ownerTargetAccess);
    for(const malicious of ['req.body.username','req.query.username','req.params.ownerId','req.params.username']) expect(ownerAuthoritySource(file,`${locator}; lookupOwner(${malicious})`)).toMatch(ownerTargetAccess);
    expect(ownerAuthoritySource('tunes/server/routes/owner.ts',locator)).toMatch(ownerTargetAccess);
    expect(ownerAuthoritySource(file,`${locator}; lookupOwner(${locator})`)).toMatch(ownerTargetAccess);
    expect(ownerAuthoritySource(file,locator.replace('req.params.username','req.body.username'))).toMatch(ownerTargetAccess);
  });
  const client = productionFiles(resolve(root, "tunes/client/src"));
  const server = productionFiles(resolve(root, "tunes/server"));

  it("does not send or advertise X-Username", () => {
    // Break caught: a shared client silently reintroduces browser-selected ownership.
    expect(matches(client, /x-username/i)).toEqual([]);
  });

  it("does not call removed browser identity bridges or append owner selectors to Music URLs", () => {
    // Break caught: an active hook lands on a typed retirement instead of using the C5 credential API.
    expect(matches(client, /\/api\/auth\/(?:sync|user-data|onboarding-status)/i)).toEqual([]);
    expect(matches(client, /\/api\/(?:playlists|playlist\/(?:songs|currently-playing|history)|user|subscriptions|payments|youtube|instagram|gemini|seo|system-settings)[^\r\n]*(?:[?&](?:username|email|userId|musicUserId|ownerId|accountId|documentId|guestUrl)=)/i)).toEqual([]);
  });

  it("routes every active owner caller through the C5 credential adapter", () => {
    // Break caught: a direct fetch lands on an owner retirement boundary with only cookies/native auth.
    const nonAdminClient = client.filter((file) => !/[\\/]pages[\\/](?:admin|tabs)[\\/]/.test(file));
    expect(matches(nonAdminClient, /\bfetch\(\s*[`'"]\/api\/(?:subscriptions|youtube|instagram|payments|gemini|email|system-settings)(?:\/|[`'"])/i)).toEqual([]);
  });

  it("does not send browser identity fields in converted owner request bodies", () => {
    // Break caught: an own-account settings form becomes a caller-selected Music owner target.
    const joined = client.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(joined).not.toMatch(/apiRequest\([\s\S]{0,240}[`'"]\/api\/user(?:\/|[`'"])[\s\S]{0,320}\b(?:currentUsername|username|email|userId|musicUserId|ownerId|accountId|documentId)\s*:/i);
  });

  it("never treats a public guest URL slug as the guest capability", () => {
    // Break caught: a capability secret is sourced from or embedded in a browser URL.
    expect(matches(client, /guestMusicRequest\(\s*(?:guestUrl|user\?\.guestUrl)\b/)).toEqual([]);
  });

  it("uses the C6 socket credential and event contract in the production hook", () => {
    // Break caught: server-only socket tests pass while the browser still sends query guestUrl and generic message events.
    const hook = readFileSync(resolve(root, "tunes/client/src/hooks/use-websocket.tsx"), "utf8");
    expect(hook).not.toMatch(/query\s*:\s*\{\s*guestUrl/);
    expect(hook).not.toMatch(/(?:emit|on)\(\s*[`'"]message[`'"]/);
    expect(hook).toMatch(/auth\s*:/);
    expect(hook).toMatch(/auth:\s*guestCapability\s*\?\s*\{\s*guestCapability\s*\}\s*:\s*\(callback/);
    expect(hook).toMatch(/musicCredentialForRequest\(\)\.then\(\(freshToken\)/);
    expect(hook).toMatch(/player_state/);
    expect(hook).toMatch(/guest_request/);
  });

  it("has an explicit visible browser import for a per-slug out-of-band guest capability", () => {
    // Break caught: all guest mutations read sessionStorage, but no supported flow can put authority there.
    const credential = readFileSync(resolve(root, "tunes/client/src/lib/musicCredential.ts"), "utf8");
    expect(credential).toMatch(/export function setGuestMusicCapability/);
    expect(credential).toMatch(/sessionStorage\.setItem\(guestCapabilityKey\(guestUrl\), capability\)/);
    expect(credential).toMatch(/export function acquireGuestMusicCapability/);
    expect(credential).toMatch(/export function importGuestMusicCapability/);
    expect(credential).not.toMatch(/\bprompt\s*\(/);
    const production = client.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(production).toMatch(/<GuestCapabilityImport/);
    expect(production).not.toMatch(/\/api\/music\/guest-capability\/rotate/);
    expect(production).toMatch(/apiRequest\(\s*[`'"]POST[`'"],\s*[`'"]\/api\/music\/publication[`'"]/);
  });

  it("keeps owner dashboard reads off the public publication URL and retires profile fetch UX explicitly", () => {
    const dashboard = readFileSync(resolve(root, "tunes/client/src/pages/dashboard-page.tsx"), "utf8");
    const profile = readFileSync(resolve(root, "tunes/client/src/hooks/use-profile.ts"), "utf8");
    expect(dashboard).not.toMatch(/[`'"]\/api\/playlist\/\$\{user(?:\?\.)?\.guestUrl\}/);
    expect(dashboard).toMatch(/\/api\/music\/dashboard/);
    expect(dashboard).toMatch(/ensureShareCapability/);
    const publication = readFileSync(resolve(root, "tunes/client/src/lib/musicPublicationClient.ts"), "utf8");
    expect(publication).toMatch(/Idempotency-Key/);
    expect(dashboard).toMatch(/guestCapabilityHandoff\(capability, user\.guestUrl\)/);
    expect(profile).not.toMatch(/\/api\/user\/profile/);
  });

  it("does not leave active product code calling retired C6 families", () => {
    // Break caught: typed 410 is correctly registered but the UI silently keeps invoking it as a live feature.
    const active = client.filter((file) => !file.endsWith(".backup") && !/[\\/]pages[\\/](?:admin|tabs)[\\/]/.test(file));
    expect(matches(active, /apiRequest\([\s\S]{0,80}[`'"]\/api\/(?:subscriptions\/|user\/devices|user\/change-password|user\/profile|playlist\/import-|playlists\/[^`'"]+\/import-)/i)).toEqual([]);
  });

  it("does not bypass C5 for playback completion or send the removed playlist bulk shape", () => {
    // Break caught: the UI advances despite an unauthenticated failed clear, or posts {songs} to the flat-song contract.
    const player = readFileSync(resolve(root, "tunes/client/src/components/youtube-player.tsx"), "utf8");
    const dashboard = readFileSync(resolve(root, "tunes/client/src/pages/dashboard-page.tsx"), "utf8");
    expect(player).not.toMatch(/fetch\(\s*[`'"]\/api\/playlist\/currently-playing/);
    expect(dashboard).not.toMatch(/\/api\/playlists\/\$\{playlistId\}\/songs[`'"],\s*\{\s*songs\s*:/);
  });

  it("does not decode JWTs without verification", () => {
    // Break caught: a converted surface trusts claims from jwt.decode.
    expect(matches(server, /\bjwt\s*\.\s*decode\s*\(/i)).toEqual([]);
  });

  it("contains no executable route/controller service-token GraphQL proxy", () => {
    // Break caught: a dead-looking controller is registered later and regains arbitrary Strapi authority.
    const routeControllers = server.filter((file) => /[\\/](?:routes|controllers)[\\/]/.test(file)
      && !file.endsWith("seo-routes.ts") && !file.endsWith("musicSurfaceRoutes.ts"));
    expect(matches(routeControllers, /STRAPI_ACCESS_TOKEN|\/graphql\b/i)).toEqual([]);
  });

  it("contains no caller-owned owner target access outside explicit rejection or native recovery", () => {
    // Break caught: username/email/user IDs return as an owner selector in an old handler.
    const authorityFiles = server.filter((file) => /[\\/](?:routes|controllers)[\\/]|user-routes\.ts$/.test(file)
      && !/[\\/](?:authRoutes|reactivationRoutes|musicIdentityRoutes|musicSurfaceRoutes)\.ts$/.test(file));
    expect(authorityFiles.flatMap((file) => ownerAuthoritySource(relative(root, file), readFileSync(file, "utf8"))
      .split(/\r?\n/).flatMap((line, index) => ownerTargetAccess.test(line) ? [`${relative(root, file)}:${index + 1}`] : []))).toEqual([]);
  });

  it.each([
    "parsePublicProfileUsername(req.params.username)",
    "parsePublicProfileRequest({ username: req.params.username, category: req.params.category })",
    "parsePublicProfileDetailRequest({ username: req.params.username, category: req.params.category, slug: req.params.slug })",
  ])("recognizes a validated public profile locator without excluding other authority access: %s", (locator) => {
    const file = "tunes/server/routes/explorersPublicProfileRoutes.ts";
    expect(ownerAuthoritySource(file, locator)).not.toMatch(ownerTargetAccess);
    for (const malicious of ["req.body.username", "req.query.username", "req.params.ownerId", "req.params.username"]) {
      expect(ownerAuthoritySource(file, `${locator}; lookupOwner(${malicious})`)).toMatch(ownerTargetAccess);
    }
    expect(ownerAuthoritySource("tunes/server/routes/owner.ts", locator)).toMatch(ownerTargetAccess);
    expect(ownerAuthoritySource(file, `${locator}; lookupOwner(${locator})`)).toMatch(ownerTargetAccess);
    expect(ownerAuthoritySource(file, locator.replace("req.params.username", "req.body.username"))).toMatch(ownerTargetAccess);
  });
});
