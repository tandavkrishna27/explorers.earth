import { z } from "zod";
import type { AuthoritativeAbsence } from "../workers/musicLifecycleWorker";
import { cancelResponseBody, readBoundedResponseBody } from "./upstreamResponseBody";

const documentId = z.string().trim().min(1).max(512);
const record = z.object({ documentId }).strict();
const responseSchema = z.object({
  data: z.object({
    usersPermissionsUser: record.nullable(),
    account: record.nullable(),
  }).strict(),
  errors: z.array(z.unknown()).max(20).optional(),
}).strict();

export interface StrapiIdentityAbsenceProofOptions {
  baseUrl: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs: number;
}

/** Read-only, immutable-ID proof used after the browser's upstream delete attempt. */
export class StrapiIdentityAbsenceProof {
  private readonly endpoint: URL;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: StrapiIdentityAbsenceProofOptions) {
    const origin = new URL(options.baseUrl);
    if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== options.baseUrl
        || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 30_000) {
      throw new Error("invalid Strapi identity absence proof configuration");
    }
    this.endpoint = new URL("/graphql", origin);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async prove(identity: { userDocumentId: string; accountDocumentId: string }): Promise<AuthoritativeAbsence> {
    if (!this.options.accessToken || !documentId.safeParse(identity.userDocumentId).success
        || !documentId.safeParse(identity.accountDocumentId).success) return "outage";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.accessToken}`,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: `query MusicIdentityAbsence($userDocumentId: ID!, $accountDocumentId: ID!) {
            usersPermissionsUser(documentId: $userDocumentId) { documentId }
            account(documentId: $accountDocumentId) { documentId }
          }`,
          variables: identity,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        await cancelResponseBody(response);
        return "outage";
      }
      let body: string;
      try { body = await readBoundedResponseBody(response, 64 * 1024, this.options.timeoutMs, controller); }
      catch (error) { return error instanceof RangeError ? "unknown" : "outage"; }
      let decoded: unknown;
      try { decoded = JSON.parse(body); }
      catch { return "unknown"; }
      const parsed = responseSchema.safeParse(decoded);
      if (!parsed.success || parsed.data.errors?.length) return "unknown";
      const { usersPermissionsUser: user, account } = parsed.data.data;
      if (user === null && account === null) return "absent";
      if ((user === null || user.documentId === identity.userDocumentId)
          && (account === null || account.documentId === identity.accountDocumentId)) return "present";
      return "unknown";
    } catch {
      return "outage";
    } finally {
      clearTimeout(timer);
    }
  }
}
