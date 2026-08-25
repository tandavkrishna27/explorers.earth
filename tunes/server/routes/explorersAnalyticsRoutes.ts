import type { Express, Request } from "express";
import { z } from "zod";
import {
  explorersAnalyticsInputSchema,
  IdempotencyConflictError,
  type ExplorersAnalyticsService,
} from "../services/explorers-analytics-service";

const readScopeSchema = z.object({
  accountId: z.string().trim().min(1).max(128),
  from: z.string().datetime(),
  to: z.string().datetime(),
}).superRefine((scope, context) => {
  const from = Date.parse(scope.from);
  const to = Date.parse(scope.to);
  const maxWindowMs = 93 * 24 * 60 * 60 * 1_000;
  if (from > to) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["from"],
      message: "from must not be after to",
    });
  } else if (to - from > maxWindowMs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["from"],
      message: "analytics window must not exceed 93 days",
    });
  }
});

export interface ExplorersAnalyticsRouteDependencies {
  service: Pick<ExplorersAnalyticsService, "ingest" | "readAccountEvents">;
  authorizeOwner: (request: Request, accountId: string) => Promise<boolean>;
  validatePublicTarget: (
    input: z.infer<typeof explorersAnalyticsInputSchema>,
  ) => Promise<boolean>;
  allowWrite: (request: Request, accountId: string) => boolean;
}

export function setupExplorersAnalyticsRoutes(
  app: Express,
  dependencies: ExplorersAnalyticsRouteDependencies,
): void {
  app.post("/api/explorers/analytics/events", async (req, res) => {
    const parsed = explorersAnalyticsInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid analytics event",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    try {
      if (!parsed.data.consent) {
        await dependencies.service.ingest(parsed.data, {
          getIp: () => null,
        });
        return res.status(204).send();
      }
      if (!dependencies.allowWrite(req, parsed.data.accountId)) {
        return res.status(429).json({ message: "Analytics rate limit exceeded" });
      }
      if (!(await dependencies.validatePublicTarget(parsed.data))) {
        return res.status(404).json({ message: "Analytics target not found" });
      }
      const result = await dependencies.service.ingest(parsed.data, {
        getIp: () => req.ip || null,
      });
      if (result.status === "consent-denied") return res.status(204).send();
      if (result.status === "pending") return res.status(202).json(result);
      return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        return res.status(409).json({ message: error.message });
      }
      console.error("Explorers analytics ingestion failed", error);
      return res.status(502).json({ message: "Analytics ingestion failed" });
    }
  });

  app.get("/api/explorers/analytics/events", async (req, res) => {
    const parsed = readScopeSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid analytics scope" });
    }

    try {
      if (!(await dependencies.authorizeOwner(req, parsed.data.accountId))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const events = await dependencies.service.readAccountEvents(parsed.data);
      return res.status(200).json({ events });
    } catch (error) {
      console.error("Explorers analytics read failed", error);
      return res.status(502).json({ message: "Analytics read failed" });
    }
  });
}
