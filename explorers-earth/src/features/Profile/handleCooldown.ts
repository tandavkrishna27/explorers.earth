type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Whether the handle may be changed now. The server decides and reports the date
 * (`handleChangeAllowedAt`): it is the only place that knows when the last change was, so
 * the page never works it out from a timestamp of its own.
 */
export function handleCooldownFor(allowedAt: string | null | undefined, now: Date = new Date()): { locked: boolean; allowedAt: Date | null } {
  if (!allowedAt) return { locked: false, allowedAt: null };
  const date = new Date(allowedAt);
  if (Number.isNaN(date.getTime()) || date.getTime() <= now.getTime()) return { locked: false, allowedAt: null };
  return { locked: true, allowedAt: date };
}

/** The date in the UI language (not the browser's regional format, which is US-style for many users). */
export function formatCooldownDate(
  date: Date,
  // The i18n setup keeps <html lang> on the active UI language.
  locale: string | undefined = typeof document !== "undefined" ? document.documentElement.lang : undefined,
): string {
  try {
    return new Intl.DateTimeFormat(locale || undefined, { dateStyle: "long" }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(date);
  }
}

export function handleCooldownMessage(t: Translate, allowedAt: Date | string | null | undefined, locale?: string): string {
  const date = typeof allowedAt === "string" ? new Date(allowedAt) : allowedAt;
  return date && !Number.isNaN(date.getTime())
    ? t("toast.warning.usernameCooldownUntil", { date: formatCooldownDate(date, locale) })
    : t("toast.warning.usernameCooldownReady");
}

/** The date a refused handle change reports, if this error is that refusal. */
export function nextAllowedAtFrom(error: unknown): string | undefined {
  const refusal = error as { code?: unknown; details?: { nextAllowedAt?: unknown } } | null;
  return refusal && refusal.code === "HANDLE_COOLDOWN" && typeof refusal.details?.nextAllowedAt === "string"
    ? refusal.details.nextAllowedAt : undefined;
}
