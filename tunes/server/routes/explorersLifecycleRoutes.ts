import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { Pool } from "pg";
import type { ExplorersAuth, ExplorersAuthConfig } from "../auth/betterAuth";
import { requireActor, sendActorError } from "../middleware/explorersPrincipal";
import { AccountLifecycleFailure, AccountLifecycleService } from "../application/accountLifecycle";
import { recoverAccount, requireRecoveryPrincipal } from "../auth/accountRecovery";
import { recoveryProofCookie, recoveryProofCookieOptions } from "../auth/recoveryCallback";

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
  app.get("/api/explorers/v1/recovery/status", async (request, response) => {
    try {
      const principal = await requireRecoveryPrincipal(request, pool);
      const account = await pool.query<{ revision: string; status: string }>(
        "SELECT revision::text,status FROM creator_accounts WHERE id=$1", [principal.accountId]);
      response.json({ recovery: { status: account.rows[0].status, revision: Number(account.rows[0].revision) } });
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
