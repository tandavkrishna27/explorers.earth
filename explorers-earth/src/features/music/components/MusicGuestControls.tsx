import { useEffect, useRef, useState } from "react";
import type { MusicGuestControls as GuestControlsValue } from "../musicWorkspaceClient";
import Switch from "../../../components/ui/Switch";

const definitions: Array<{ key: keyof GuestControlsValue; label: string; description: string }> = [
  { key: "allowSongRequests", label: "Allow song requests", description: "Guests with access can search and request songs." },
  { key: "allowGuestPlayOnDevice", label: "Allow playback on guest devices", description: "Guests can use playback controls on their own device." },
  { key: "allowPlaylistSharing", label: "Show shared playlists", description: "Playlists marked Shared appear on the guest page." },
  { key: "allowRecentlyPlayedVisibility", label: "Show recently played", description: "Guests can see your recently played history." },
  { key: "allowQueueVisibility", label: "Show queue", description: "Guests can see what is playing and up next." },
];

type SaveOutcome = { reconciliationFailed?: boolean } | void;

export function MusicGuestControls({ value, onSave, readOnly = false }: { value: GuestControlsValue; onSave: (value: GuestControlsValue) => Promise<SaveOutcome>; readOnly?: boolean }) {
  const [current, setCurrent] = useState(value);
  const [pending, setPending] = useState<Set<keyof GuestControlsValue>>(new Set());
  const [errors, setErrors] = useState<Partial<Record<keyof GuestControlsValue, string>>>({});
  const pendingRef = useRef(pending);
  const currentRef = useRef(current);
  const saveTail = useRef<Promise<void>>(Promise.resolve());
  pendingRef.current = pending;
  currentRef.current = current;
  useEffect(() => {
    const next = definitions.reduce<GuestControlsValue>((snapshot, definition) => {
      snapshot[definition.key] = pendingRef.current.has(definition.key) ? currentRef.current[definition.key] : value[definition.key];
      return snapshot;
    }, { ...currentRef.current });
    currentRef.current = next;
    setCurrent(next);
  }, [value]);
  const change = async (key: keyof GuestControlsValue) => {
    if (readOnly || pending.has(key)) return;
    const previous = currentRef.current[key];
    const next = { ...currentRef.current, [key]: !currentRef.current[key] };
    currentRef.current = next;
    setCurrent(next);
    setPending((values) => new Set(values).add(key));
    setErrors((values) => ({ ...values, [key]: undefined }));
    const save = async () => {
      try {
        const outcome = await onSave({ ...currentRef.current });
        if (outcome?.reconciliationFailed) {
          setErrors((values) => ({ ...values, [key]: "Guest control saved, but the latest settings could not be loaded." }));
        }
      }
      catch {
        currentRef.current = { ...currentRef.current, [key]: previous };
        setCurrent(currentRef.current);
        const label = definitions.find((definition) => definition.key === key)?.label ?? "Guest control";
        setErrors((values) => ({ ...values, [key]: `${label} could not be saved. Try again.` }));
      }
      finally { setPending((values) => { const copy = new Set(values); copy.delete(key); return copy; }); }
    };
    const queued = saveTail.current.then(save, save);
    saveTail.current = queued.then(() => undefined, () => undefined);
    await queued;
  };
  return <section aria-labelledby="music-guest-controls-heading" className="space-y-3">
    <div><h2 id="music-guest-controls-heading" className="text-lg font-semibold text-dashboard">Guest controls</h2><p className="mt-1 text-sm text-dashboard-muted">Choose what visitors can do on your shared Music page.</p></div>
    {definitions.map((definition) => { const errorId = `music-guest-control-error-${definition.key}`; return <div key={definition.key} className="flex min-h-16 items-center justify-between gap-4 border-b border-white/5 py-3 last:border-b-0">
      <div className="min-w-0"><p className="font-medium text-dashboard">{definition.label}</p><p className="text-sm text-dashboard-muted">{definition.description}</p></div>
      <Switch checked={current[definition.key]} onChange={() => void change(definition.key)} disabled={readOnly} loading={pending.has(definition.key)} ariaLabel={definition.label} ariaDescribedBy={errors[definition.key] ? errorId : undefined} />
      {pending.has(definition.key) && <span role="status" className="sr-only">Saving {definition.label}…</span>}
      {errors[definition.key] && <p id={errorId} role="alert" className="text-sm text-red-400">{errors[definition.key]}</p>}
    </div>; })}
  </section>;
}
