import { randomUUID } from "node:crypto";

export type ContainmentCode =
  | "AUTH_REQUIRED" | "AUTH_INVALID" | "AUTH_SUSPENDED" | "AMBIGUOUS_CREDENTIALS"
  | "AMBIGUOUS_OWNER_INPUT" | "REQUEST_INVALID" | "CSRF_INVALID" | "ORIGIN_FORBIDDEN"
  | "GRAPHQL_PROXY_REMOVED" | "SERVICE_CREDENTIAL_ROUTE_REMOVED" | "LEGACY_IDENTITY_ROUTE_REMOVED"
  | "LEGACY_OWNER_ROUTE_REMOVED" | "ADMIN_REQUIRED" | "PAYLOAD_TOO_LARGE" | "RATE_LIMITED"
  | "INTERNAL_ERROR" | "SOCKET_EVENT_FORBIDDEN" | "SOCKET_PAYLOAD_INVALID";

const SAFE_MESSAGES: Record<ContainmentCode, { message: string; action: string; retryable: boolean }> = {
  AUTH_REQUIRED: { message: "Authentication is required.", action: "authenticate", retryable: false },
  AUTH_INVALID: { message: "Authentication could not be verified.", action: "authenticate", retryable: false },
  AUTH_SUSPENDED: { message: "This Music account is unavailable.", action: "contact_support", retryable: false },
  AMBIGUOUS_CREDENTIALS: { message: "Use exactly one authentication method.", action: "retry", retryable: false },
  AMBIGUOUS_OWNER_INPUT: { message: "Owner fields are not accepted.", action: "retry", retryable: false },
  REQUEST_INVALID: { message: "The request is invalid.", action: "retry", retryable: false },
  CSRF_INVALID: { message: "The request could not be verified.", action: "refresh", retryable: true },
  ORIGIN_FORBIDDEN: { message: "This origin is not allowed.", action: "stop", retryable: false },
  GRAPHQL_PROXY_REMOVED: { message: "This GraphQL endpoint is no longer available.", action: "upgrade_client", retryable: false },
  SERVICE_CREDENTIAL_ROUTE_REMOVED: { message: "This service credential endpoint is no longer available.", action: "upgrade_client", retryable: false },
  LEGACY_IDENTITY_ROUTE_REMOVED: { message: "This identity endpoint is no longer available.", action: "upgrade_client", retryable: false },
  LEGACY_OWNER_ROUTE_REMOVED: { message: "This owner-targeted endpoint is no longer available.", action: "upgrade_client", retryable: false },
  ADMIN_REQUIRED: { message: "Administrator permission is required.", action: "stop", retryable: false },
  PAYLOAD_TOO_LARGE: { message: "The request payload is too large.", action: "reduce_payload", retryable: false },
  RATE_LIMITED: { message: "Too many requests.", action: "retry", retryable: true },
  INTERNAL_ERROR: { message: "Music is temporarily unavailable.", action: "retry", retryable: true },
  SOCKET_EVENT_FORBIDDEN: { message: "This socket event is not allowed.", action: "stop", retryable: false },
  SOCKET_PAYLOAD_INVALID: { message: "The socket payload is invalid.", action: "retry", retryable: false },
};

export function errorEnvelope(code: ContainmentCode, requestId: string = randomUUID()) {
  return { error: { code, ...SAFE_MESSAGES[code], requestId } };
}
