/** Returns a copy of `items` with the entry at `from` moved to `to`. Out-of-range moves are no-ops. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export const fillTemplate = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((result, [key, value]) => result.split(`{{${key}}}`).join(String(value)), template);
