import type { PublicPageAnalyticsData } from '../api/queries';

/**
 * Names for list ids seen in the owner's analytics. Click events carry the list's display
 * name (metadata.listName) next to its id, which covers every media category; the Places
 * lists are supplied separately by the caller. Raw ids are never a display name.
 */
export function buildListNameMap(
  records: PublicPageAnalyticsData[],
  known: ReadonlyMap<string, string> = new Map(),
): Map<string, string> {
  const names = new Map<string, string>(known);
  for (const record of records) {
    const listId = record.Location_Id;
    if (!listId || names.has(listId)) continue;
    for (const stat of record.Stats ?? []) {
      const name = stat.metadata?.listName;
      if (typeof name === 'string' && name.trim()) {
        names.set(listId, name.trim());
        break;
      }
    }
  }
  return names;
}
