import { Star } from "lucide-react";
import type { KeyboardEvent } from "react";
import { starsFromValue, stepValue, type StoredRating } from "./starRatingScale";

type Props = { value: StoredRating; onChange: (value: StoredRating) => void; label: string; disabled?: boolean };

// One widget for every category (scope ADD-05 / DS-01). Each star has two hit areas (half steps).
export default function StarRating({ value, onChange, label, disabled = false }: Props) {
  const stars = starsFromValue(value);
  const pick = (stored: number) => { if (!disabled) onChange(stored === value ? null : stored); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const keys: Record<string, StoredRating> = {
      ArrowRight: stepValue(value, 1), ArrowUp: stepValue(value, 1),
      ArrowLeft: stepValue(value, -1), ArrowDown: stepValue(value, -1),
      Home: null, End: 10,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    onChange(keys[event.key]);
  };
  return (
    <div
      role="slider" tabIndex={disabled ? -1 : 0} aria-label={label}
      aria-valuemin={0} aria-valuemax={10} aria-valuenow={value ?? 0}
      aria-valuetext={`${stars} of 5 stars`} aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown} className="inline-flex gap-1 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = stars >= n ? "full" : stars >= n - 0.5 ? "half" : "empty";
        return (
          <span key={n} className="relative h-11 w-11">
            <Star aria-hidden className="absolute inset-0 m-auto h-7 w-7 text-gray-600" />
            {fill !== "empty" && (
              <span className={`absolute inset-y-0 left-0 overflow-hidden ${fill === "half" ? "w-1/2" : "w-full"}`}>
                <Star aria-hidden className="absolute bottom-0 left-0 top-0 m-auto ml-2 h-7 w-7 fill-amber-500 text-amber-500" />
              </span>
            )}
            <button type="button" tabIndex={-1} aria-label={`${n - 0.5} stars`} disabled={disabled}
              onClick={() => pick(n * 2 - 1)} className="absolute inset-y-0 left-0 w-1/2" />
            <button type="button" tabIndex={-1} aria-label={`${n} stars`} disabled={disabled}
              onClick={() => pick(n * 2)} className="absolute inset-y-0 right-0 w-1/2" />
          </span>
        );
      })}
    </div>
  );
}
