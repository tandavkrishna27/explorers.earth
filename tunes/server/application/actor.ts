/** Server-only authority. A transport must resolve this from its verified credential. */
export type Actor = {
  userId: string;
  accountId: string;
  role: "owner";
  credential:
    | { kind: "web-session"; sessionId: string; sessionVersion: number }
    | { kind: "oauth"; grantId: string; scopes: readonly string[] };
};
