import { useState } from "react";
import { useTranslation } from "react-i18next";
// Temporary stand-in for WP2's PublishPill.
// swap for components/controls/* when WP2 merges (components/controls/PublishPill.tsx).
type Status = "draft" | "public";
type Props = { kind: "list" | "item"; value: Status; privateComingSoon?: boolean; onChange: (status: Status) => void | Promise<void> };

export default function PublishPillStub({ value, privateComingSoon, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = value === "public" ? `🌐 ${t("dashboard.wp3b.public", "Public")} ▾` : `✎ ${t("dashboard.wp3b.draft", "Draft")} ▾`;
  const pick = (status: Status) => { setOpen(false); if (status !== value) void onChange(status); };
  return (
    <div className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        className="min-h-9 rounded-full border border-white/15 px-3 text-xs font-semibold">
        {label}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-20 grid min-w-[180px] rounded-xl border border-white/10 bg-[#1f2430] p-1 text-sm">
          <button role="menuitem" type="button" onClick={() => pick("draft")} className="rounded px-3 py-2 text-left hover:bg-white/5">✎ {t("dashboard.wp3b.draft", "Draft")}</button>
          <button role="menuitem" type="button" onClick={() => pick("public")} className="rounded px-3 py-2 text-left hover:bg-white/5">🌐 {t("dashboard.wp3b.public", "Public")}</button>
          {privateComingSoon && (
            <button role="menuitem" type="button" disabled aria-disabled="true" className="rounded px-3 py-2 text-left opacity-50">👥 {t("dashboard.wp3b.privateSoon", "Private — coming soon")}</button>
          )}
        </div>
      )}
    </div>
  );
}
