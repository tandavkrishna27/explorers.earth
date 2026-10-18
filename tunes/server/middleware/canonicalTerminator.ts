import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { apiErrorCodes, type ApiError } from "../../shared/explorersContract";

type Environment = Record<string, string | undefined>;
type ApiErrorCode = (typeof apiErrorCodes)[number];

function normalizePeerAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const unwrapped = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  return unwrapped.toLowerCase().startsWith("::ffff:") ? unwrapped.slice(7) : unwrapped;
}

/**
 * Canonical replacement for `musicIdentityConfig.isTrustedProxy`
 * (config/music-identity-config.ts:152). The normalization is identical —
 * trim, unbracket, strip an IPv4-mapped prefix.
 *
 * Two DELIBERATE differences from the Music original: it has no live/fixture
 * mode, and an unset variable yields `false` (trust nobody) instead of throwing.
 * Throwing at construction would make every unit test that builds the canonical
 * app require the variable. Trusting nobody is the safe default — the only cost
 * is that request.ip reports the proxy's address until the variable is set.
 *
 * A set-but-invalid value still throws: that is a misconfiguration, not a default.
 * `trust proxy: true` is never produced, because it would make X-Forwarded-For
 * attacker-controlled.
 *
 * MUSIC_TRUSTED_PROXY_IP stays accepted so the running compose file keeps working
 * through the cutover; drop it when that variable is renamed.
 */
export function resolveTrustedProxy(environment: Environment): ((peer: string) => boolean) | false {
  const configured = normalizePeerAddress(
    environment.EXPLORERS_TRUSTED_PROXY_IP ?? environment.MUSIC_TRUSTED_PROXY_IP,
  );
  if (configured === undefined) return false;
  if (isIP(configured) === 0) throw new Error("EXPLORERS_TRUSTED_PROXY_IP must be one exact IP address");
  return (peer: string) => normalizePeerAddress(peer) === configured;
}

const NOT_FOUND_MESSAGE = "The requested resource does not exist.";

function terminatorRequestId(supplied: string | undefined): string {
  return supplied && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(supplied) ? supplied : randomUUID();
}

function sendCanonicalError(
  response: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  supplied: string | undefined,
): void {
  const requestId = terminatorRequestId(supplied);
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("Cache-Control", "no-store");
  // apiErrorSchema is .strict() with exactly {code, message, requestId}. It has no
  // `retryable` — that field belongs to the unrelated containment envelope, and
  // adding it here is a contract violation, not a harmless extra.
  response.status(status).json({ error: { code, message, requestId } } satisfies ApiError);
}

/** Terminal JSON 404. Registered after every route, so reaching it means nothing matched. */
export function canonicalNotFoundHandler(request: Request, response: Response): void {
  sendCanonicalError(response, 404, "NOT_FOUND", NOT_FOUND_MESSAGE, request.get("x-request-id"));
}

/**
 * Terminal error handler.
 *
 * MUST declare exactly four parameters. Express and canonicalHandlerCustody both
 * identify an error handler by `fn.length === 4`; a rest parameter or a default
 * value silently demotes it to ordinary middleware, after which it never runs and
 * only the 404 path still works.
 */
export function canonicalErrorHandler(
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (response.headersSent) return next(error);
  const type = (error as { type?: string } | null | undefined)?.type;
  const supplied = request.get("x-request-id");
  if (type === "entity.too.large") {
    sendCanonicalError(response, 413, "RESOURCE_TOO_LARGE", "The request payload is too large.", supplied);
    return;
  }
  if (type === "entity.parse.failed") {
    sendCanonicalError(response, 400, "INVALID_INPUT", "The request body is not valid JSON.", supplied);
    return;
  }
  sendCanonicalError(response, 500, "PROVIDER_UNAVAILABLE", "The service is temporarily unavailable.", supplied);
}

export function setupCanonicalTerminator(app: Express): void {
  app.use(canonicalNotFoundHandler);
  app.use(canonicalErrorHandler);
}
