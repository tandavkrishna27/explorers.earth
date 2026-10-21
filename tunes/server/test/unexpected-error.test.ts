import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { classifyUnexpectedError } from "../http/unexpectedError";
import { sendActorError } from "../middleware/explorersPrincipal";

const pg = (code: string) => Object.assign(new Error("pg"), { code });
function respond(error: unknown) {
  const headers: Record<string, string> = {};let status = 0, body: any;
  const response: any = { setHeader: (k: string, v: string) => { headers[k] = v; }, status: (s: number) => { status = s; return response; }, json: (b: unknown) => { body = b; return response; } };
  const request: any = { get: () => undefined, method: "GET", path: "/api/explorers/v1/x", route: { path: "/api/explorers/v1/x" } };
  sendActorError(request, response, error);return { status, body, headers };
}

describe("PROD-06 unexpected error mapping", () => {
  it.each([
    [pg("53300"), "capacity"], [new Error("timeout exceeded when trying to connect"), "capacity"],
    [pg("57P01"), "connection"], [new Error("Connection terminated unexpectedly"), "connection"],
    [pg("40001"), "conflict"], [pg("40P01"), "conflict"], [pg("57014"), "timeout"],
    [Object.assign(new Error("Failed query"), { cause: pg("53300") }), "capacity"],
    [new TypeError("x is undefined"), "defect"],
  ])("classifies %s", (error, kind) => expect(classifyUnexpectedError(error).kind).toBe(kind));

  it("maps capacity to a retryable 429, conflict to 409 and a defect to a plain 503, logging each without the message", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const busy = respond(new Error("timeout exceeded when trying to connect"));
    expect(busy).toMatchObject({ status: 429, headers: { "Retry-After": "1" }, body: { error: { code: "RATE_LIMITED", retryable: true } } });
    expect(respond(pg("40001"))).toMatchObject({ status: 409, body: { error: { code: "CONFLICT", retryable: true } } });
    const defect = respond(z.object({ a: z.string() }).safeParse({ a: 1 }).error);
    expect(defect.status).toBe(503);expect(defect.body.error.retryable).toBeUndefined();expect(defect.headers["Retry-After"]).toBeUndefined();
    const lines = log.mock.calls.map(c => JSON.parse(String(c[0])));
    expect(lines[0]).toMatchObject({ event: "api_transient", status: 429, kind: "capacity", requestId: busy.body.error.requestId });
    expect(lines[2]).toMatchObject({ event: "api_5xx", status: 503, kind: "defect", errorClass: "ZodError", zodPaths: ["a"] });
    expect(JSON.stringify(lines)).not.toContain("timeout exceeded");
    log.mockRestore();
  });
});
