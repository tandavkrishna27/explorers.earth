import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { Pool } from "pg";
import type { ExplorersAuthConfig, ExplorersAuth } from "../auth/betterAuth";
import { requireActor, sendActorError } from "../middleware/explorersPrincipal";
import { ProfileService, ProfileInputError } from "../application/profiles";
import { AccountConflict } from "../repositories/explorersAccountRepository";

export function setupExplorersAccountRoutes(app: Express, pool: Pool, auth: ExplorersAuth, config: ExplorersAuthConfig): void {
  const service = new ProfileService(pool);
  app.patch("/api/explorers/v1/account", async (request, response) => {
    if (request.get("origin") !== config.baseURL) return response.status(403).json({ error: { code: "FORBIDDEN", message: "Origin is not trusted", requestId: randomUUID() } });
    try {
      const actor = await requireActor(request, auth, pool);
      const account = await service.updateAccount(actor, request.body, { requestId: randomUUID() });
      return response.status(200).json({ account });
    } catch (error) {
      if (error instanceof ProfileInputError) return response.status(422).json({ error: { code: "INVALID_INPUT", message: error.message, requestId: randomUUID() } });
      if (error instanceof AccountConflict) return response.status(409).json({ error: { code: "CONFLICT", message: error.kind === "handle" ? "Handle is unavailable" : "Account changed", requestId: randomUUID() } });
      sendActorError(request, response, error);
    }
  });
}
