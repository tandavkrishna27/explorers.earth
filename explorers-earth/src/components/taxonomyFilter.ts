// Narrow SPA view of a taxonomy catalog item (tunes/shared/explorersTaxonomyContract.ts:63).
export type TaxonomyTerm = { id: string; parentId: string | null; position: number; label: string };

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const byPosition = (a: TaxonomyTerm, b: TaxonomyTerm) => a.position - b.position;

export const rootsOf = (terms: TaxonomyTerm[]) => terms.filter((t) => t.parentId === null).sort(byPosition);
export const childrenOf = (terms: TaxonomyTerm[], rootId: string) => terms.filter((t) => t.parentId === rootId).sort(byPosition);

export function filterTerms(terms: TaxonomyTerm[], query: string): TaxonomyTerm[] {
  const q = fold(query.trim());
  if (!q) return terms;
  const starts: TaxonomyTerm[] = [];
  const contains: TaxonomyTerm[] = [];
  for (const term of terms) {
    const label = fold(term.label);
    if (label.startsWith(q) || label.split(/[\s&/-]+/).some((w) => w.startsWith(q))) starts.push(term);
    // One letter only matches word starts; mid-word hits are noise at that length.
    else if (q.length > 1 && label.includes(q)) contains.push(term);
  }
  return [...starts, ...contains];
}
