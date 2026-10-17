import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { Pool } from "pg";
import type { ExplorersAuth, ExplorersAuthConfig } from "../auth/betterAuth";
import { requireActor, sendActorError } from "../middleware/explorersPrincipal";
import { AccountLifecycleFailure, AccountLifecycleService } from "../application/accountLifecycle";
import { recoverAccount, requireRecoveryObservation, requireRecoveryPrincipal } from "../auth/accountRecovery";
import { recoveryProofCookie, recoveryProofCookieOptions } from "../auth/recoveryCallback";
import { classifyLifecycleObservation } from "../../shared/explorersLifecycleObservation";

export function setupExplorersLifecycleRoutes(app: Express, pool: Pool, auth: ExplorersAuth, config: ExplorersAuthConfig) {
  const service = new AccountLifecycleService(pool);
  const sendError = (request: Request, response: Response, error: unknown) => {
    if (!(error instanceof AccountLifecycleFailure)) return sendActorError(request, response, error);
    response.status(error.status).json({ error: { code: error.code, message: error.message, requestId: randomUUID() } });
  };
  const mutation = (handle: (request: Request) => Promise<{ status: number; body: unknown }>) =>
    async (request: Request, response: Response) => {
      if (request.get("origin") !== config.baseURL) {
        return response.status(403).json({ error: { code: "FORBIDDEN", message: "Origin is not trusted", requestId: randomUUID() } });
      }
      try { const result = await handle(request); return response.status(result.status).json(result.body); }
      catch (error) { return sendError(request, response, error); }
    };
  app.get("/api/explorers/v1/account/lifecycle", async (request, response) => {
    try { response.json({ lifecycle: await service.getAccountLifecycle(await requireActor(request, auth, pool)) }); }
    catch (error) { sendError(request, response, error); }
  });
  app.post("/api/explorers/v1/account/deletion-feedback", mutation(async (request) => {
    const actor = await requireActor(request, auth, pool);
    const feedback = await service.recordDeletionFeedback(actor, request.body,
      { requestId: randomUUID(), idempotencyKey: request.get("idempotency-key") });
    return { status: 201, body: { feedback } };
  }));
  app.post("/api/explorers/v1/account/deactivation", mutation(async (request) => {
    const actor = await requireActor(request, auth, pool);
    const lifecycle = await service.requestAccountDeactivation(actor, request.body,
      { requestId: randomUUID(), idempotencyKey: request.get("idempotency-key") });
    return { status: 200, body: { lifecycle } };
  }));
  app.post("/api/explorers/v1/account/deletion", mutation(async (request) => {
    const actor = await requireActor(request, auth, pool);
    const lifecycle = await service.requestAccountDeletion(actor, request.body,
      { requestId: randomUUID(), idempotencyKey: request.get("idempotency-key") });
    return { status: 200, body: { lifecycle } };
  }));
  // Ticket 2.4 package L0. The existing observation authority, now returning a typed
  // outcome rather than a raw status - C3 is explicit that a second endpoint must not be
  // added, so this extends this one.
  //
  // The latest operation is read in the same statement as the account, so the two cannot
  // be observed a transaction apart and produce an outcome that was never true: an account
  // read before a failure with an operation read after it would classify as pending when
  // it is already manual review. The subselect matches getAccountLifecycle's ordering, so
  // "latest operation" means the same thing on both routes.
  app.get("/api/explorers/v1/recovery/status", async (request, response) => {
    try {
      // The observation authority, not the transition principal: see
      // requireRecoveryObservation. /recovery/complete below keeps the stricter gate.
      const principal = await requireRecoveryObservation(request, pool);
      const account = await pool.query<{ revision: string; status: string; operation_id: string | null;
        operation_kind: string | null; operation_state: string | null; failure_code: string | null }>(
        `SELECT a.revision::text,a.status,o.id AS operation_id,o.kind AS operation_kind,
           o.state AS operation_state,o.failure_code
         FROM creator_accounts a
         LEFT JOIN LATERAL (SELECT id,kind,state,failure_code FROM account_lifecycle_operations
           WHERE account_id=a.id ORDER BY created_at DESC,id DESC LIMIT 1) o ON true
         WHERE a.id=$1`, [principal.accountId]);
      // No row is the indeterminate case, not a crash. The previous code indexed rows[0]
      // unconditionally; it was unreachable because a bound principal implies an account
      // row, but "unknown" is precisely what this union exists to be able to say.
      const row = account.rows[0];
      response.json({
        recovery: classifyLifecycleObservation({
          accountId: principal.accountId,
          status: row?.status ?? null,
          revision: row ? Number(row.revision) : null,
          operation: row?.operation_id
            ? { id: row.operation_id, kind: row.operation_kind ?? "", state: row.operation_state ?? "",
              failureCode: row.failure_code }
            : null,
        }),
      });
    } catch (error) { sendError(request, response, error); }
  });
  app.post("/api/explorers/v1/recovery/complete", async (request, response) => {
    if (request.get("origin") !== config.baseURL) {
      return response.status(403).json({ error: { code: "FORBIDDEN", message: "Origin is not trusted", requestId: randomUUID() } });
    }
    try {
      const principal = await requireRecoveryPrincipal(request, pool);
      const lifecycle = await recoverAccount(pool, principal, request.body, { requestId: randomUUID() });
      response.clearCookie(recoveryProofCookie, recoveryProofCookieOptions(config));
      return response.json({ lifecycle });
    } catch (error) { return sendError(request, response, error); }
  });
}
