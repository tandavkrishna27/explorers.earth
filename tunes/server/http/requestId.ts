import { randomUUID } from "node:crypto";
import type { Request } from "express";

type RequestWithRequestId = Request & { containmentRequestId?: string };

/** One request id per request: a well-formed caller-supplied X-Request-Id, or a fresh UUID. */
export function requestIdFor(req: Request): string {
  const request = req as RequestWithRequestId;
  const supplied = req.get("x-request-id");
  request.containmentRequestId ??= supplied && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(supplied)
    ? supplied
    : randomUUID();
  return request.containmentRequestId;
}
