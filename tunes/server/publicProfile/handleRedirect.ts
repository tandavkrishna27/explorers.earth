// The profile an old handle points to while the handle is held. The service answers a shell
// read for such a handle with this marker; the routes turn it into a 308 to the same
// resource under the new handle, so links to the old address keep working for the hold.
const VERSION = "explorers-public-redirect/v1";

export type HandleRedirect = { version: typeof VERSION; username: string };

export const handleRedirectMarker = (username: string): HandleRedirect => ({ version: VERSION, username });

export function movedHandle(value: unknown): string | undefined {
  const candidate = value as Partial<HandleRedirect> | null | undefined;
  return candidate?.version === VERSION && typeof candidate.username === "string" ? candidate.username : undefined;
}

/** The request's own path and query, with the old handle swapped for the new one. */
export function redirectLocation(originalUrl: string, newHandle: string): string {
  const prefix = "/api/explorers/v1/profiles/";
  const start = originalUrl.indexOf(prefix);
  const rest = start < 0 ? "" : originalUrl.slice(start + prefix.length);
  const boundary = rest.search(/[/?]/);
  return `${prefix}${encodeURIComponent(newHandle)}${boundary < 0 ? "" : rest.slice(boundary)}`;
}

/** What the shell read says about a handle nobody holds now: the handle it moved to, if it moved. */
export async function movedHandleFor(
  shell: ((username: string) => Promise<unknown | undefined>) | undefined,
  username: string,
): Promise<string | undefined> {
  try { return movedHandle(await shell?.(username)); } catch { return undefined; }
}
