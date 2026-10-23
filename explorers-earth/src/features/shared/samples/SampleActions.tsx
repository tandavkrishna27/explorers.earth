import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Props = { onMakeMine: () => Promise<void>; onDelete: () => Promise<void> };

/** The sample bar's Make it mine + Delete buttons; Delete confirms first because it is permanent. */
export function SampleActions({ onMakeMine, onDelete }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => setConfirming(true)}
        className="min-h-11 rounded-xl border border-white/10 px-4 text-sm text-gray-200 disabled:opacity-50 md:min-h-9">
        {t("samples.deleteSample", "Delete sample")}
      </button>
      {/* Stays disabled once converted, so a second click before the refetch lands sends nothing. */}
      <button type="button" disabled={busy || done} onClick={() => { if (!done) void run(onMakeMine, () => { doneRef.current = true; setDone(true); }); }}
        className="min-h-11 rounded-xl bg-blue-400 px-4 text-sm font-medium text-white disabled:opacity-50 md:min-h-9">
        {t("samples.makeMine", "Make it mine")}
      </button>
      {done && <p role="status" className="text-sm text-emerald-400">{t("samples.nowYours", "Now yours")}</p>}
      {confirming && <SampleDeleteDialog busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => run(onDelete, () => setConfirming(false))} />}
    </div>
  );
}

export function SampleDeleteDialog({ busy, onCancel, onConfirm }: { busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="sample-delete-title" aria-describedby="sample-delete-body"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
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
