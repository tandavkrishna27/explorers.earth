import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import QrCardTagline from "../../../components/QrCardTagline";
import { exportElementPng, savePng } from "../../../utils/exportElementPng";
import { buildQrUrl } from "../../../utils/listShareUrls";
import type { ListPageAdapter } from "./listPageAdapter";

export default function ShareTab({ adapter }: { adapter: ListPageAdapter }) {
  const { t } = useTranslation();
  const card = useRef<HTMLDivElement>(null);
  const list = adapter.list;
  if (!list) return null;
  const isPublic = list.status === "public";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(list.publicUrl);
      toast.success(t("dashboard.wp3b.linkCopied", "Link copied"));
    } catch {
      toast.error(t("dashboard.wp3b.copyFailed", "Could not copy the link."));
    }
  };
  const download = async () => {
    try {
      savePng(await exportElementPng(card.current, {}), `${list.slug}-qr.png`);
    } catch {
      toast.error(t("dashboard.wp3b.qrDownloadFailed", "Could not create the QR image. Try again."));
    }
  };
  const share = async () => {
    if (navigator.share) await navigator.share({ title: list.title, url: list.publicUrl }).catch(() => undefined);
    else await copy();
  };

  return (
    <div className="grid gap-4 pt-3">
      {!isPublic && (
        <p className="rounded-xl border border-white/10 p-3 text-sm text-gray-300">
          {t("dashboard.wp3b.shareDraft", "Publish this list to share it. Only you can see drafts.")}
        </p>
      )}
      <div className="grid gap-2 rounded-2xl border border-white/10 bg-[#151a25] p-4">
        <h2 className="text-sm font-semibold">{t("dashboard.wp3b.shareTitle", "Share this list")}</h2>
        <div className="flex gap-2">
          <input
            readOnly
            value={list.publicUrl}
            aria-label={t("dashboard.wp3b.listLink", "List link")}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b0f15] px-3 py-2 text-xs"
          />
          <button type="button" onClick={copy} disabled={!isPublic} className="min-h-11 rounded-xl bg-blue-400 px-4 text-white disabled:opacity-50">
            {t("dashboard.wp3b.copyLink", "Copy link")}
          </button>
        </div>
        <button type="button" onClick={share} disabled={!isPublic} className="min-h-11 justify-self-start rounded-xl border border-white/10 px-4 disabled:opacity-50">
          {t("dashboard.wp3b.shareVia", "Share…")}
        </button>
      </div>
      <div className="grid justify-items-start gap-2">
        <div ref={card} data-testid="list-qr-card" className="grid w-[240px] justify-items-center gap-2 rounded-2xl bg-gradient-to-b from-slate-900 to-blue-900 p-5">
          <QRCodeSVG value={buildQrUrl(list.publicUrl)} size={160} includeMargin bgColor="#ffffff" fgColor="#000000" />
          <b className="text-center text-sm">{list.title}</b>
          <QrCardTagline className="text-xs" category={adapter.category} />
        </div>
        <button type="button" onClick={download} disabled={!isPublic} className="min-h-11 rounded-xl bg-blue-400 px-4 text-white disabled:opacity-50">
          {t("dashboard.wp3b.downloadQr", "Download QR")}
        </button>
      </div>
      <p className="text-xs text-gray-400">
        {t("dashboard.wp3b.privateSharingSoon", "Private sharing — coming soon: only people you invite by email.")}
      </p>
    </div>
  );
}
