/**
 * WP11. `isSample` is a required field of the shared collection DTO, but legacy view models and
 * older fixtures may not carry it, so every read goes through this one defensive accessor.
 */
export function readIsSample(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { isSample?: unknown }).isSample === true;
}

/**
 * Copies a collection's sample flag onto a legacy view model. The flag is added only when true,
 * so ordinary lists keep exactly the shape they had before WP11.
 */
export function withSampleFlag<T extends object>(collection: unknown, view: T): T {
  return readIsSample(collection) ? Object.assign(view, { isSample: true }) : view;
}
