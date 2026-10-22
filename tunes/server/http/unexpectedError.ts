import type { NextFunction, Request, Response } from "express";

/**
 * PROD-06. The last-resort mapping for an error no route recognised. It says whether the
 * failure is transient database capacity (retry soon) or a defect, and writes one log line
 * that names the cause. The line holds only the error's class, PostgreSQL SQLSTATE, Zod
 * issue paths and the route path: never messages, values, query strings, cookies or ids
 * from the body, which can carry owner content.
 */
export type UnexpectedErrorClass = "capacity" | "connection" | "conflict" | "timeout" | "defect";

// SQLSTATEs that mean "this attempt lost a race for a resource; the same request can succeed".
const capacityCodes = new Set(["53000", "53100", "53200", "53300", "53400"]);
const connectionCodes = new Set(["08000", "08001", "08003", "08004", "08006", "57P01", "57P02", "57P03"]);
const conflictCodes = new Set(["40001", "40P01", "55P03"]);
const timeoutCodes = new Set(["57014"]);

function field(error: unknown, name: string): unknown {
  return error !== null && typeof error === "object" ? (error as Record<string, unknown>)[name] : undefined;
}

export function classifyUnexpectedError(error: unknown): { kind: UnexpectedErrorClass; pgCode?: string; errorClass: string; zodPaths?: string[] } {
  // Better Auth and Drizzle wrap the pg error ("Failed query", APIError); the SQLSTATE is
  // on the innermost cause, so classify the deepest cause and report the outer class.
  let inner = error;
  for (let depth = 0; depth < 5 && field(inner, "cause") !== undefined && field(inner, "cause") !== inner; depth++) inner = field(inner, "cause");
  if (inner !== error) return { ...classifyUnexpectedError(inner), errorClass: `${error instanceof Error ? error.constructor.name : typeof error}>${inner instanceof Error ? inner.constructor.name : typeof inner}` };
  const errorClass = error instanceof Error ? error.constructor.name : typeof error;
  const code = field(error, "code"), pgCode = typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
  const message = error instanceof Error ? error.message : "";
  const issues = field(error, "issues");
  const zodPaths = Array.isArray(issues)
    ? issues.slice(0, 5).map((issue) => (Array.isArray(field(issue, "path")) ? (field(issue, "path") as unknown[]).map(String).join(".") : ""))
    : undefined;
  let kind: UnexpectedErrorClass = "defect";
  // Better Auth turns any adapter failure during the session lookup into this APIError and
  // keeps no cause. The lookup is one indexed read, so the failure is the database.
  if (errorClass === "APIError" && field(error, "status") === "INTERNAL_SERVER_ERROR") kind = "connection";
  else if (pgCode && capacityCodes.has(pgCode)) kind = "capacity";
  else if (pgCode && connectionCodes.has(pgCode)) kind = "connection";
  else if (pgCode && conflictCodes.has(pgCode)) kind = "conflict";
  else if (pgCode && timeoutCodes.has(pgCode)) kind = "timeout";
  // node-postgres raises these without a SQLSTATE: pool acquire timeout and a dropped socket.
  else if (/timeout exceeded when trying to connect/i.test(message)) kind = "capacity";
  else if (/Connection terminated|ECONNRESET|ECONNREFUSED|Client has encountered a connection error/i.test(message)
    || code === "ECONNRESET" || code === "ECONNREFUSED" || code === "EPIPE") kind = "connection";
  return { kind, errorClass, ...(pgCode ? { pgCode } : {}), ...(zodPaths ? { zodPaths } : {}) };
}

export function logServerError(request: Request, requestId: string, status: number, error: unknown): ReturnType<typeof classifyUnexpectedError> {
  const cause = classifyUnexpectedError(error);
  const route = (request.route?.path as string | undefined) ?? request.path;
  console.error(JSON.stringify({ event: status >= 500 ? "api_5xx" : "api_transient", requestId, method: request.method, route, status, ...cause }));
  (request as Request & { serverErrorLogged?: boolean }).serverErrorLogged = true;
  return cause;
}

/** Logs every 5xx that no handler already explained, with the request id the body carried. */
export function logServerErrorResponses(request: Request, response: Response, next: NextFunction): void {
  if (typeof response.on !== "function" || typeof response.json !== "function") { next(); return; }
  const json = response.json.bind(response);
  let body: unknown;
  response.json = (value: unknown) => { body = value; return json(value); };
  response.on("finish", () => {
    if (response.statusCode < 500 || (request as Request & { serverErrorLogged?: boolean }).serverErrorLogged) return;
    const error = field(body, "error"), requestId = field(error, "requestId"), code = field(error, "code");
    const route = (request.route?.path as string | undefined) ?? request.path;
    console.error(JSON.stringify({ event: "api_5xx", requestId: typeof requestId === "string" ? requestId : response.getHeader?.("X-Request-Id") ?? null,
      method: request.method, route, status: response.statusCode, code: typeof code === "string" ? code : null }));
  });
  next();
}
