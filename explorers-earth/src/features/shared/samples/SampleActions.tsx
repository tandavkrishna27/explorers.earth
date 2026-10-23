import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  /** Converts the sample; `name` is the (possibly edited) list name from the Make it mine sheet. */
  onMakeMine: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  /** The list's current name; when set, Make it mine asks first in a sheet (mocks v3). */
  listTitle?: string;
  /** "3 movies": the sheet's item count, already pluralised. */
  itemsLabel?: string;
};

/** The sample bar's Delete + Make it mine buttons; both confirm first. */
export function SampleActions({ onMakeMine, onDelete, listTitle, itemsLabel }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState(false);
  // The ref closes the gap before `busy` re-renders, so a double click sends one request.
  const inFlight = useRef(false);
  const doneRef = useRef(false);
  const run = async (work: () => Promise<void>, after?: () => void) => {
    if (inFlight.current || doneRef.current) return;
    inFlight.current = true;
    setBusy(true);
    try { await work(); after?.(); } catch { /* the caller reports the failure */ } finally { inFlight.current = false; setBusy(false); }
  };
  const convert = (name: string) => run(() => onMakeMine(name), () => { doneRef.current = true; setDone(true); setAsking(false); });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => setConfirming(true)} aria-label={t("samples.deleteSample", "Delete sample")}
        className="min-h-11 rounded-xl border border-white/10 px-4 text-sm text-gray-200 disabled:opacity-50 md:min-h-9">
        {t("samples.delete", "Delete")}
      </button>
      {/* Stays disabled once converted, so a second click before the refetch lands sends nothing. */}
      <button type="button" disabled={busy || done}
        onClick={() => { if (done) return; if (listTitle === undefined) void convert(""); else setAsking(true); }}
        className="min-h-11 rounded-xl bg-blue-400 px-4 text-sm font-medium text-white disabled:opacity-50 md:min-h-9">
        {t("samples.makeMine", "Make it mine")}
      </button>
      {done && <p role="status" className="text-sm text-emerald-400">{t("samples.nowYours", "Now yours")}</p>}
      {confirming && <SampleDeleteDialog busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => run(onDelete, () => setConfirming(false))} />}
      {asking && listTitle !== undefined && (
        <MakeMineSheet title={listTitle} itemsLabel={itemsLabel} busy={busy} onCancel={() => setAsking(false)} onConfirm={(name) => void convert(name)} />
      )}
    </div>
  );
}

/** 'Make "<name>" yours?' with an editable list name (mocks v3). */
export function MakeMineSheet({ title, itemsLabel, busy, onCancel, onConfirm }: {
  title: string; itemsLabel?: string; busy?: boolean; onCancel: () => void; onConfirm: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(title);
  const id = useId();
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151a25] p-5 text-left"
        onSubmit={(event) => { event.preventDefault(); if (name.trim()) onConfirm(name.trim()); }}>
        <h2 id={`${id}-title`} className="text-base font-semibold text-gray-50">
          {t("samples.makeMineTitle", "Make \"{{name}}\" yours?", { name: title, interpolation: { escapeValue: false } })}
        </h2>
        <p id={`${id}-body`} className="mt-1 text-sm text-gray-400">
          {t("samples.makeMineBody", "It becomes a normal draft list with its {{items}}. You can rename, edit, reorder and publish it. Your other samples stay until you delete them.",
            { items: itemsLabel ?? "", interpolation: { escapeValue: false } })}
        </p>
        <label className="mt-3 grid gap-1 text-xs text-gray-300">{t("samples.listName", "List name")}
          <input value={name} maxLength={500} onChange={(event) => setName(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#0b0f15] px-3 py-2 text-sm text-gray-50" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm text-gray-200">{t("samples.cancel", "Cancel")}</button>
          <button type="submit" disabled={busy || !name.trim()} className="min-h-11 rounded-xl bg-blue-400 px-4 text-sm font-medium text-white disabled:opacity-50">{t("samples.makeMine", "Make it mine")}</button>
        </div>
      </form>
    </div>
  );
}

export function SampleDeleteDialog({ busy, onCancel, onConfirm }: { busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="sample-delete-title" aria-describedby="sample-delete-body"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151a25] p-5 text-left">
        <h2 id="sample-delete-title" className="text-base font-semibold text-gray-50">{t("samples.deleteTitle", "Delete this sample?")}</h2>
        <p id="sample-delete-body" className="mt-1 text-sm text-gray-400">{t("samples.deleteBody", "It won't come back.")}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm text-gray-200">{t("samples.cancel", "Cancel")}</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="min-h-11 rounded-xl bg-red-500 px-4 text-sm text-white disabled:opacity-50">{t("samples.delete", "Delete")}</button>
        </div>
      </div>
    </div>
  );
}
