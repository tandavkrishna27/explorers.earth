import { z } from "zod";

export const MUSIC_ERROR_VERSION = "music-error/v1" as const;
export const MUSIC_IDENTITY_VERSION = "music-identity/v1" as const;
export const MUSIC_PRINCIPAL_VERSION = "music-principal/v1" as const;
export const MUSIC_IDENTITY_RESPONSE_STATUSES = [200, 400, 401, 403, 409, 429, 500, 502, 503] as const;
export type MusicIdentityResponseStatus = typeof MUSIC_IDENTITY_RESPONSE_STATUSES[number];

export const musicIdentityStatusSchema = z.literal("active");
/** The ensure operation has no JSON request entity. */
export const musicEnsureRequestSchema = z.undefined();

export const musicEnsureResponseSchema = z.object({
  version: z.literal(MUSIC_IDENTITY_VERSION),
  identity: z.object({
    musicUserId: z.number().int().positive(),
    status: musicIdentityStatusSchema,
  }).strict(),
  credential: z.object({
    token: z.string().min(64).max(4_096),
    expiresAt: z.number().int().positive(),
  }).strict(),
}).strict();

export const musicPrincipalResponseSchema = z.object({
  version: z.literal(MUSIC_PRINCIPAL_VERSION),
  identity: z.object({
    musicUserId: z.number().int().positive(),
    status: musicIdentityStatusSchema,
  }).strict(),
}).strict();

export const musicErrorCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "AUTH_INVALID",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "TOKEN_REVOKED",
  "RESOURCE_FORBIDDEN",
  "ENTITLEMENT_REQUIRED",
  "PUBLIC_NOT_FOUND",
  "GUEST_CAPABILITY_INVALID",
  "SURFACE_REMOVED",
  "ORIGIN_FORBIDDEN",
  "PAYLOAD_TOO_LARGE",
  "SOCKET_EVENT_FORBIDDEN",
  "REQUEST_INVALID",
  "IDENTITY_INELIGIBLE",
  "ONBOARDING_INCOMPLETE",
  "ACCOUNT_AMBIGUOUS",
  "ACCOUNT_SWITCH_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "QUEUE_REVISION_CONFLICT",
  "PLAYBACK_REVISION_CONFLICT",
  "PLAYBACK_QUEUE_REVISION_CONFLICT",
  "PUBLICATION_REPLAY_EXPIRED",
  "IDENTITY_CONFLICT",
  "IDENTITY_TOMBSTONED",
  "IDENTITY_PENDING_DELETION",
  "IDENTITY_SUSPENDED",
  "LIFECYCLE_NOT_FOUND",
  "LIFECYCLE_CANCEL_FORBIDDEN",
  "LIFECYCLE_DEAD_LETTER",
  "UPSTREAM_MALFORMED",
  "UPSTREAM_UNAVAILABLE",
  "DATABASE_UNAVAILABLE",
  "RATE_LIMITED",
  "ENTRY_DISABLED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const musicErrorEnvelopeSchema = z.object({
  version: z.literal(MUSIC_ERROR_VERSION),
  error: z.object({
    code: musicErrorCodeSchema,
    message: z.string().min(1).max(160),
    action: z.enum(["authenticate", "complete_onboarding", "contact_support", "retry", "none"]),
    retryable: z.boolean(),
    requestId: z.string().min(1).max(64),
  }).strict(),
}).strict();

export type MusicEnsureResponse = z.infer<typeof musicEnsureResponseSchema>;
export type MusicErrorEnvelope = z.infer<typeof musicErrorEnvelopeSchema>;
export type MusicErrorCode = z.infer<typeof musicErrorCodeSchema>;
export type MusicErrorAction = MusicErrorEnvelope["error"]["action"];
export type MusicIdentityClientResponse =
  | { status: 200; requestId: string; body: MusicEnsureResponse }
  | { status: Exclude<MusicIdentityResponseStatus, 200>; requestId: string; retryAfterSeconds?: number; body: MusicErrorEnvelope };

export class MusicIdentityError extends Error {
  constructor(
    readonly code: MusicErrorCode,
    readonly status: number,
    message: string,
    readonly action: MusicErrorAction,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
    readonly safeConflictCategory?: string,
  ) {
    super(message);
    this.name = "MusicIdentityError";
  }
}

export function musicErrorEnvelope(error: MusicIdentityError, requestId: string): MusicErrorEnvelope {
  return {
    version: MUSIC_ERROR_VERSION,
    error: {
      code: error.code,
      message: error.message,
      action: error.action,
      retryable: error.retryable,
      requestId,
    },
  };
}

export function parseMusicIdentityClientResponse(
  status: number,
  headers: Headers | Record<string, string | string[] | undefined>,
  body: unknown,
): MusicIdentityClientResponse {
  if (!(MUSIC_IDENTITY_RESPONSE_STATUSES as readonly number[]).includes(status)) {
    throw new Error(`undocumented Music identity status ${status}`);
  }
  const requestId = responseHeader(headers, "x-request-id");
  if (!requestId || requestId.length > 64) throw new Error("X-Request-Id response header is required");
  if (status === 200) {
    return { status: 200, requestId, body: musicEnsureResponseSchema.parse(body) };
  }
  const errorBody = musicErrorEnvelopeSchema.parse(body);
  if (errorBody.error.requestId !== requestId) throw new Error("X-Request-Id must equal the error requestId");
  const errorStatus = status as Exclude<MusicIdentityResponseStatus, 200>;
  if (status === 429 || status === 503) {
    const retryAfter = responseHeader(headers, "retry-after");
    if (!retryAfter || !/^[1-9][0-9]*$/.test(retryAfter)) throw new Error("Retry-After integer-seconds response header is required");
    return { status: errorStatus, requestId, retryAfterSeconds: Number(retryAfter), body: errorBody };
  }
  return { status: errorStatus, requestId, body: errorBody };
}

function responseHeader(headers: Headers | Record<string, string | string[] | undefined>, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = entry?.[1];
  return Array.isArray(value) ? value[0] : value;
}

export const musicEnsureResponseOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "identity", "credential"],
  properties: {
    version: { type: "string", enum: [MUSIC_IDENTITY_VERSION] },
    identity: {
      type: "object",
      additionalProperties: false,
      required: ["musicUserId", "status"],
      properties: {
        musicUserId: { type: "integer", minimum: 1 },
        status: { type: "string", enum: ["active"] },
      },
    },
    credential: {
      type: "object",
      additionalProperties: false,
      required: ["token", "expiresAt"],
      properties: {
        token: { type: "string", minLength: 64, maxLength: 4_096 },
        expiresAt: { type: "integer", minimum: 1 },
      },
    },
  },
} as const;

export const musicPrincipalResponseOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "identity"],
  properties: {
    version: { type: "string", enum: [MUSIC_PRINCIPAL_VERSION] },
    identity: {
      type: "object",
      additionalProperties: false,
      required: ["musicUserId", "status"],
      properties: {
        musicUserId: { type: "integer", minimum: 1 },
        status: { type: "string", enum: ["active"] },
      },
    },
  },
} as const;

export const musicErrorOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "error"],
  properties: {
    version: { type: "string", enum: [MUSIC_ERROR_VERSION] },
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "action", "retryable", "requestId"],
      properties: {
        code: { type: "string", enum: musicErrorCodeSchema.options },
        message: { type: "string", maxLength: 160 },
        action: { type: "string", enum: ["authenticate", "complete_onboarding", "contact_support", "retry", "none"] },
        retryable: { type: "boolean" },
        requestId: { type: "string", maxLength: 64 },
      },
    },
  },
} as const;

const requestIdResponseHeader = {
  description: "Bounded request correlation identifier",
  required: true,
  schema: { type: "string", minLength: 1, maxLength: 64 },
} as const;

const retryAfterResponseHeader = {
  description: "Minimum whole seconds before retrying",
  required: true,
  schema: { type: "string", pattern: "^[1-9][0-9]*$" },
} as const;

const responseHeaders = (retryAfter = false) => ({
  "X-Request-Id": requestIdResponseHeader,
  ...(retryAfter ? { "Retry-After": retryAfterResponseHeader } : {}),
});

const errorResponse = (description: string, retryAfter = false) => ({
  description,
  headers: responseHeaders(retryAfter),
  content: { "application/json": { schema: { $ref: "#/components/schemas/MusicErrorEnvelope" } } },
});

export const musicIdentityOpenApi = {
  path: "/api/music/identity/ensure",
  operation: {
    post: {
      tags: ["Music Identity"],
      summary: "Ensure the authenticated Explorer Music identity",
      security: [{ strapiBearer: [] }],
      responses: {
        "200": {
          description: "Stable Music identity projection",
          headers: responseHeaders(),
          content: { "application/json": { schema: { $ref: "#/components/schemas/MusicIdentityEnsureResponse" } } },
        },
        "400": errorResponse("Invalid bodyless request"),
        "401": errorResponse("Missing or invalid Strapi proof"),
        "403": errorResponse("Explorer is not eligible"),
        "409": errorResponse("Immutable identity or lifecycle conflict"),
        "429": errorResponse("Bounded rate limit", true),
        "500": errorResponse("Safe internal failure"),
        "502": errorResponse("Malformed authoritative response"),
        "503": errorResponse("Temporary upstream or database failure", true),
      },
    },
  },
} as const;

export const musicPrincipalOpenApi = {
  path: "/api/music/identity/current",
  operation: {
    get: {
      tags: ["Music Identity"],
      summary: "Resolve the current local Music principal",
      security: [{ musicBearer: [] }],
      responses: {
        "200": {
          description: "Current locally authorized Music identity",
          headers: responseHeaders(),
          content: { "application/json": { schema: { $ref: "#/components/schemas/MusicPrincipalResponse" } } },
        },
        "401": errorResponse("Missing, invalid, expired, or revoked Music credential"),
        "403": errorResponse("Suspended identity"),
        "409": errorResponse("Identity pending deletion"),
        "500": errorResponse("Safe internal failure"),
        "503": errorResponse("Temporary database failure", true),
      },
    },
  },
} as const;
