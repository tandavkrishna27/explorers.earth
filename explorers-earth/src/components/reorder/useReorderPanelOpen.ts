import { useCallback, useState } from 'react';

// Whether each reorder panel is open, kept outside the component. Every move re-reads the
// owner content, and the screens around a panel show their loading state while that read
// runs, which unmounts the panel with its local state and closed it after each move. The
// panel stays open until the owner closes it.
const openPanels = new Set<string>();

export function useReorderPanelOpen(key: string): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState(() => openPanels.has(key));
  const setOpen = useCallback((next: boolean) => {
    if (next) openPanels.add(key); else openPanels.delete(key);
    setOpenState(next);
  }, [key]);
  return [open, setOpen];
}
