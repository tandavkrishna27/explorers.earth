import { useCallback, useState } from "react";

export type AddItemMode = "search" | "manual" | "picked";

export function useAddItemMode<T>(options: { initialPicked?: T | null } = {}) {
  const [mode, setMode] = useState<AddItemMode>(options.initialPicked ? "picked" : "search");
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [picked, setPicked] = useState<T | null>(options.initialPicked ?? null);

  const goManual = useCallback(() => { setManualName((name) => name || query); setMode("manual"); }, [query]);
  const backToSearch = useCallback(() => setMode("search"), []);
  const pick = useCallback((item: T) => { setPicked(item); setMode("picked"); }, []);
  const change = useCallback(() => { setPicked(null); setMode("search"); }, []);
  const reset = useCallback(() => { setMode("search"); setQuery(""); setManualName(""); setPicked(null); }, []);

  return { mode, query, setQuery, manualName, setManualName, picked, goManual, backToSearch, pick, change, reset };
}
