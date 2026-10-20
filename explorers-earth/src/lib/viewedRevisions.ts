import useAuthStore from "../store/store";

// Lost-update guard. An owner's edit is composed against the version they were LOOKING at,
// but every command re-reads the resource right before it writes, so the revision it sent
// was the freshest one and the server's optimistic lock could never trip: two tabs editing
// one list both got 200 and the last write silently won.
//
// The owner views record here the revision of every list and recommendation they display.
// A command refuses to write when the re-read it composed against is no longer that
// revision, which is exactly "the user's edit was based on something that has changed".
// Only views record; the re-reads inside commands never do, so they cannot launder a newer
// revision into the baseline.
type Kind = "collection" | "recommendation";
type Row = { id: string; revision: number };

let scope = "";
const viewed = new Map<string, number>();
let account: number | undefined;

function currentScope() {
  const { accountId, generation } = useAuthStore.getState();
  const next = `${accountId ?? ""}:${generation}`;
  if (next !== scope) {
    scope = next;
    viewed.clear();
    account = undefined;
  }
}
const slot = (kind: Kind, id: string) => `${kind}:${id.toLowerCase()}`;

export function recordViewedRevision(kind: Kind, id: string, revision: number): void {
  currentScope();
  viewed.set(slot(kind, id), revision);
}

// Observations an owner view (or a form hydrated from one) is holding. A held observation sends
// the revision it was loaded at, so the server's lock already catches a stale save from it; the
// guard exists for the observation a command reads for itself right before writing.
const viewObservations = new WeakSet<object>();
export const isViewObservation = (observation: object): boolean => viewObservations.has(observation);
export function recordViewedObservation(observation: { kind: Kind; resourceId: string; resourceRevision: number }): void {
  recordViewedRevision(observation.kind, observation.resourceId, observation.resourceRevision);
  viewObservations.add(observation);
}

/** What an owner view just displayed. */
export function recordViewedContent(content: { collections: readonly Row[]; recommendations: readonly Row[] }, observations: Iterable<object> = []): void {
  currentScope();
  for (const observation of observations) viewObservations.add(observation);
  for (const row of content.collections ?? []) viewed.set(slot("collection", row.id), row.revision);
  for (const row of content.recommendations ?? []) viewed.set(slot("recommendation", row.id), row.revision);
}

export function viewedRevision(kind: Kind, id: string): number | undefined {
  currentScope();
  return viewed.get(slot(kind, id));
}

/** True when the view showed a different version than the one a command re-read. */
export function changedSinceViewed(kind: Kind, id: string, revision: number): boolean {
  const baseline = viewedRevision(kind, id);
  return baseline !== undefined && baseline !== revision;
}

/**
 * After this tab's own successful write: keep tracking the resource at the revision the
 * server returned, or stop tracking it when the new revision is not known (a side effect on
 * a parent, say), so the tab's own follow-up edit is not mistaken for a foreign change. The
 * reload that follows every command records the exact value again.
 */
export function settleViewedRevision(kind: Kind, id: string, revision?: number): void {
  currentScope();
  const key = slot(kind, id);
  if (!viewed.has(key)) return;
  if (revision === undefined) viewed.delete(key);
  else viewed.set(key, revision);
}

export function recordViewedAccount(revision: number): void {
  currentScope();
  account = revision;
}
export function viewedAccountRevision(): number | undefined {
  currentScope();
  return account;
}
export function settleViewedAccount(revision: number): void {
  currentScope();
  if (account !== undefined) account = revision;
}

// A command is replayed under its idempotency key after a lost response. The first attempt may
// well have committed, which is exactly what moves the revision past the one the owner viewed,
// so a replay is the server's to answer (it returns the stored result) and not this guard's to
// refuse. Bounded: only recent keys matter.
const sentKeys = new Set<string>();
const SENT_KEYS_LIMIT = 500;
export function markCommandSent(key: string): void {
  sentKeys.add(key);
  if (sentKeys.size > SENT_KEYS_LIMIT) sentKeys.delete(sentKeys.values().next().value as string);
}
export const wasCommandSent = (key: string): boolean => sentKeys.has(key);
