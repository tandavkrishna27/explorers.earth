import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { errorEnvelope } from "../containment-error-contract";
import { isNativeRegistrationPath, pathnameFromRequestTarget } from "../registration-route-contract";

const port = Number(process.env.PORT ?? "5100");
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("invalid compatibility port");
const host = process.env.MUSIC_COMPAT_HOST ?? "0.0.0.0";
const maxBodyBytes = 8 * 1024;
const requestTimeoutMs = 2_000;

function sendJson(response: import("node:http").ServerResponse, status: number, body: object, requestId?: string): void {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(encoded),
    ...(requestId ? { "x-request-id": requestId } : {}),
    "cache-control": "no-store",
  });
  response.end(encoded);
}

// These deadlines must be constructor options. Node schedules incomplete-header
// expiry from the constructor's connection-check interval; assigning
// `headersTimeout` after construction leaves the default 30 second sweep in
// effect even when the property itself reports a smaller value.
const server = createServer({
  headersTimeout: requestTimeoutMs,
  requestTimeout: requestTimeoutMs,
  keepAliveTimeout: 1_000,
  keepAliveTimeoutBuffer: 0,
  connectionsCheckingInterval: 250,
}, (request, response) => {
  const pathname = pathnameFromRequestTarget(request.url);
  if (request.method === "GET" && pathname === "/health/live") {
    sendJson(response, 200, { status: "live" });
    return;
  }
  if (request.method === "POST" && pathname !== undefined && isNativeRegistrationPath(pathname)) {
    const requestId = randomUUID();
    let bodyBytes = 0;
    let completed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (status: number, code: "LEGACY_IDENTITY_ROUTE_REMOVED" | "PAYLOAD_TOO_LARGE" | "REQUEST_INVALID") => {
      if (completed) return;
      completed = true;
      if (timeout) clearTimeout(timeout);
      if (status !== 410) response.setHeader("connection", "close");
      sendJson(response, status, errorEnvelope(code, requestId), requestId);
      if (status !== 410) response.once("finish", () => request.socket.destroy());
    };
    const declaredLength = request.headers["content-length"];
    if (declaredLength !== undefined && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBodyBytes)) {
      finish(413, "PAYLOAD_TOO_LARGE");
      request.resume();
      return;
    }
    timeout = setTimeout(() => finish(408, "REQUEST_INVALID"), requestTimeoutMs);
    request.on("data", (chunk: Buffer) => {
      bodyBytes += chunk.length;
      if (bodyBytes > maxBodyBytes) {
        request.pause();
        finish(413, "PAYLOAD_TOO_LARGE");
      }
    });
    request.once("end", () => finish(410, "LEGACY_IDENTITY_ROUTE_REMOVED"));
    request.once("error", () => {
      clearTimeout(timeout);
      if (!completed) response.destroy();
    });
    return;
  }
  request.resume();
  sendJson(response, 404, { error: { code: "NOT_FOUND" } });
});

server.maxHeadersCount = 32;
server.maxConnections = 128;

server.listen(port, host, () => {
  if (process.env.MUSIC_COMPAT_REPORT_ADDRESS === "1") {
    const address = server.address();
    if (address && typeof address !== "string") process.stdout.write(`${JSON.stringify({ port: address.port })}\n`);
  }
});
