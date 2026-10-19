import type { Express, Request } from "express";
import { z } from "zod";
import {AuthorizationError} from '../application/authorization';
import {
  explorersAnalyticsInputSchema,
  IdempotencyConflictError,
} from "../services/explorers-analytics-service";

const isStandaloneMusicCanonicalPath = (canonicalPath: string): boolean => {
  const segments = canonicalPath
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment).trim().toLowerCase());
  return segments.length === 2 && segments[0] === "music" && segments[1] === "share";
};

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}, "must be a canonical calendar date");

const ianaTimeZones = new Set(Intl.supportedValuesOf("timeZone"));
const timeZoneSchema = z.string().trim().min(1).max(128).refine(
  (value) => value === "UTC" || ianaTimeZones.has(value),
  "must be a valid IANA timezone",
);

const datePartsInZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
};

const localDateTimeToInstant = (value: string, timeZone: string, endOfDay: boolean) => {
  const [year, month, day] = value.split("-").map(Number);
  const hour = endOfDay ? 23 : 0;
  const minute = endOfDay ? 59 : 0;
  const second = endOfDay ? 59 : 0;
  const millisecond = endOfDay ? 999 : 0;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const zoneParts = datePartsInZone(new Date(utcGuess), timeZone);
  const observedAsUtc = Date.UTC(
    zoneParts.year,
    zoneParts.month - 1,
    zoneParts.day,
    zoneParts.hour,
    zoneParts.minute,
    zoneParts.second,
    millisecond,
  );
  return new Date(utcGuess - (observedAsUtc - utcGuess));
};

const matchesZonedCalendarDate = (date: Date, value: string, timeZone: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const parts = datePartsInZone(date, timeZone);
  return parts.year === year && parts.month === month && parts.day === day;
};

const calendarDayIndex = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

const readScopeSchema = z.object({
  accountId: z.string().trim().min(1).max(128),
  fromDate: dateOnlySchema,
  toDate: dateOnlySchema,
  timeZone: timeZoneSchema,
}).transform((scope, context) => {
  const inclusiveDays = Math.floor(
    (calendarDayIndex(scope.toDate) - calendarDayIndex(scope.fromDate)) /
      (24 * 60 * 60 * 1_000),
  ) + 1;
  if (inclusiveDays < 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fromDate"],
      message: "fromDate must not be after toDate",
    });
    return z.NEVER;
  }
  if (inclusiveDays > 93) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fromDate"],
      message: "analytics window must not exceed 93 calendar days",
    });
    return z.NEVER;
  }
  const from = localDateTimeToInstant(scope.fromDate, scope.timeZone, false);
  const to = localDateTimeToInstant(scope.toDate, scope.timeZone, true);
  if (
    !matchesZonedCalendarDate(from, scope.fromDate, scope.timeZone) ||
    !matchesZonedCalendarDate(to, scope.toDate, scope.timeZone)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fromDate"],
      message: "analytics range contains a calendar date that does not exist in the selected timezone",
    });
    return z.NEVER;
  }
  if (from > to) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fromDate"],
      message: "derived analytics range must not be inverted",
    });
    return z.NEVER;
  }
  return {
    accountId: scope.accountId,
    from: from.toISOString(),
    to: to.toISOString(),
  };
});

export interface ExplorersAnalyticsRouteDependencies {
  service: {ingest(input:z.infer<typeof explorersAnalyticsInputSchema>,context:{getIp:()=>string|null}):Promise<{status:'consent-denied'}|{status:'pending'|'dropped';duplicate:true}|{status:'committed';duplicate:boolean;documentId?:string;retired?:true}>;readAccountEvents(scope:{accountId:string;from:string;to:string},request?:object):Promise<unknown[]>};
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
    if (
      parsed.data.event.page === "public-music" &&
      isStandaloneMusicCanonicalPath(parsed.data.event.canonicalPath)
    ) {
      return res.status(400).json({ message: "Invalid analytics event" });
    }

    try {
      if (parsed.data.basis !== "anonymous-v1" && parsed.data.consent !== true) {
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
      if (result.status === "dropped") return res.status(409).json(result);
      return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      if(error instanceof AuthorizationError)return res.status(error.status).json({message:error.message});
      if (error instanceof IdempotencyConflictError) {
        return res.status(409).json({ message: error.message });
      }
      console.error("Explorers analytics ingestion failed");
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
      const events = await dependencies.service.readAccountEvents(parsed.data, req);
      return res.status(200).json({ events });
    } catch (error) {
      console.error("Explorers analytics read failed");
      return res.status(502).json({ message: "Analytics read failed" });
    }
  });
}
