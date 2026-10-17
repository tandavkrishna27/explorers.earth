import { MusicIdentityError } from "../../shared/musicError";

/**
 * Bounded reads of an upstream HTTP response body.
 *
 * Moved out of `strapiIdentityGateway.ts` for ticket 8.1a. Nothing here is about Strapi:
 * the same helpers serve `youtubeReadService`, `reactivation-service` and
 * `strapiIdentityAbsenceProof`, and the canonical startup closure reached them only
 * through a file whose name said Strapi. The retired-dependency scan allowlisted that
 * file on exactly those grounds; this module is what lets the allowlist entry go.
 *
 * Behaviour is unchanged from the original - this is a move, not a rewrite.
 */

/** A bounded body that is over its limit, or not valid UTF-8. */
export class MalformedUpstreamBodyError extends RangeError {
  constructor() {
    super("bounded upstream response is malformed");
    this.name = "MalformedUpstreamBodyError";
  }
}

/**
 * Races an operation against a deadline and aborts the controller when it wins, so a
 * stalled read cannot hold a connection open past its budget.
 */
export async function withDeadline<T>(operation: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("deadline exceeded"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function cancelResponseBody(response: Response): Promise<void> {
  if (!response.body || response.body.locked) return;
  try { await response.body.cancel(); }
  catch { /* the connection is already unusable; there is nothing left to drain */ }
}

export async function readBoundedResponseBody(
  response: Response,
  maximumBytes: number,
  timeoutMs: number,
  controller: AbortController,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const startedAt = Date.now();
  try {
    while (true) {
      const remaining = timeoutMs - (Date.now() - startedAt);
      if (remaining <= 0) throw new Error("deadline exceeded");
      const next = await withDeadline(reader.read(), remaining, controller);
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximumBytes) throw new MalformedUpstreamBodyError();
      chunks.push(next.value);
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* already aborted */ }
    throw error;
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new MalformedUpstreamBodyError();
  }
}
