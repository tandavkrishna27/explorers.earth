import { Search, Loader2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

export type ItemSearchResult = { id: string; title: string; subtitle?: string; imageUrl?: string | null };

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  search: (query: string, signal: AbortSignal) => Promise<ItemSearchResult[]>;
  onPick: (result: ItemSearchResult) => void;
  onAddManually: () => void;
  placeholder: string;
  /** Extra buttons inside the field (Places: my location and map). */
  trailing?: ReactNode;
  /** Replaces the result list (Places nearby / coordinates states). */
  override?: ReactNode;
};

type State = { status: "idle" | "loading" | "done" | "error"; items: ItemSearchResult[] };

// Search-first add (scope ADD-03): debounced, aborts the previous request, Enter searches now.
export default function ItemSearch({ query, onQueryChange, search, onPick, onAddManually, placeholder, trailing, override }: Props) {
  const { t } = useTranslation();
  const listId = useId();
  const [state, setState] = useState<State>({ status: "idle", items: [] });
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(async (text: string) => {
    controller.current?.abort();
    if (text.trim().length < 2) { setState({ status: "idle", items: [] }); return; }
    const own = new AbortController();
    controller.current = own;
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const items = await search(text.trim(), own.signal);
      if (!own.signal.aborted) setState({ status: "done", items });
    } catch {
      if (!own.signal.aborted) setState({ status: "error", items: [] });
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => { void run(query); }, 300);
    return () => clearTimeout(timer);
  }, [query, run]);
  useEffect(() => () => controller.current?.abort(), []);

  return (
    <div className="grid gap-2">
      <div className="flex justify-end">
        <button type="button" onClick={onAddManually} className="text-xs text-blue-400 hover:underline">
          {t("dashboard.wp4.addManuallyLink", "Can't find it? Add manually")}
        </button>
      </div>
      <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#0b0f15] py-1 pl-3 pr-1">
        <Search aria-hidden className="h-4 w-4 text-gray-400" />
        <input
          role="combobox" aria-expanded={state.items.length > 0} aria-controls={listId} aria-autocomplete="list"
          value={query} placeholder={placeholder} onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void run(query); } }}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
        />
        {state.status === "loading" && <Loader2 aria-label={t("dashboard.wp4.searching", "Searching")} className="h-4 w-4 animate-spin" />}
        {trailing}
      </div>
      {override ?? (
        <>
          {state.status === "error" && (
            <p role="alert" className="text-sm text-red-400">{t("dashboard.wp4.searchFailed", "Search isn't working right now. Try again or add it manually.")}</p>
          )}
          {state.status === "done" && state.items.length === 0 && (
            <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-white/20 p-6 text-center">
              <b>{t("dashboard.wp4.noMatches", 'No matches for "{{query}}"', { query: query.trim() })}</b>
              <p className="text-sm text-gray-400">{t("dashboard.wp4.noMatchesHint", "Add it yourself; what you typed comes with you.")}</p>
              <button type="button" onClick={onAddManually} className="rounded-xl bg-blue-400 px-4 py-2 text-white">
                {t("dashboard.wp4.addManually", "Add manually")}
              </button>
            </div>
          )}
          <ul id={listId} role="listbox" className="grid gap-1">
            {state.items.map((item) => (
              <li key={item.id} role="option" aria-selected={false} tabIndex={0}
                onClick={() => onPick(item)} onKeyDown={(e) => { if (e.key === "Enter") onPick(item); }}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-white/5">
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-10 w-8 rounded object-cover" /> : <span className="h-10 w-8 rounded bg-slate-700" />}
                <span className="min-w-0"><b className="block truncate text-sm">{item.title}</b>{item.subtitle && <span className="text-xs text-gray-400">{item.subtitle}</span>}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
