// Stored ratings are integers 1-10 (tunes/shared/explorersContract.ts:59).
// The UI shows 5 stars in half steps, so one stored point is half a star.
export type StoredRating = number | null;

export function starsFromValue(value: StoredRating): number {
  if (value === null) return 0;
  if (!Number.isInteger(value) || value < 1 || value > 10) throw new RangeError(`rating ${value}`);
  return value / 2;
}

export function valueFromStars(stars: number): StoredRating {
  if (stars === 0) return null;
  const value = stars * 2;
  if (!Number.isInteger(value) || value < 1 || value > 10) throw new RangeError(`stars ${stars}`);
  return value;
}

export function stepValue(value: StoredRating, direction: 1 | -1): StoredRating {
  const next = (value ?? 0) + direction;
  if (next <= 0) return null;
  return Math.min(10, next);
}
