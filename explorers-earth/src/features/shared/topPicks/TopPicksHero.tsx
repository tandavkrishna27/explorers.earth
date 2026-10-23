import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CATEGORY_CONFIG, type CategoryKey } from "../category/categoryConfig";
import type { TopPickModel } from "../category/models";

export interface TopPicksHeroProps {
  category: CategoryKey;
  state: "picks" | "empty" | "firstVisit";
  picks: TopPickModel[];
  onOpenPick: (pick: TopPickModel) => void;
  onManage: () => void;
}

const Label = ({ text }: { text: string }) => (
  <div className="flex items-center gap-2 text-base font-bold text-gray-50 before:h-4 before:w-[3px] before:rounded-sm before:bg-yellow-400 before:content-['']">{text}</div>
);

export default function TopPicksHero({ category, state, picks, onOpenPick, onManage }: TopPicksHeroProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const manage = (
    <button type="button" onClick={onManage} className="rounded-xl bg-[#60a5fa] px-3.5 py-[7px] text-[13px] font-medium text-white min-h-[44px] md:min-h-0">
      ★ {t("dashboard.wp3a.topPicks.manage")}
    </button>
  );
  if (state !== "picks" || picks.length === 0) {
    const first = state === "firstVisit";
    const body = first ? t("dashboard.wp3a.topPicks.firstVisit.body")
      : CATEGORY_CONFIG[category].topPicks === "lists" ? t("dashboard.wp3a.topPicks.empty.bodyLists")
      : t("dashboard.wp3a.topPicks.empty.body", { item: t(`dashboard.wp3a.itemNoun.${category}`) });
    return (
      <section aria-label={t("dashboard.wp3a.topPicks.title")}
        className={`flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-white/[.18] p-5 text-center ${first ? "bg-gradient-to-r from-blue-400/[.14] to-emerald-500/10" : "bg-gradient-to-br from-[#0d1220] to-black"}`}>
        <Label text={t("dashboard.wp3a.topPicks.title")} />
        <div className="text-3xl text-gray-400" aria-hidden="true">☆</div>
        <b className="text-gray-50">{first ? t("dashboard.wp3a.topPicks.firstVisit.title") : t("dashboard.wp3a.topPicks.empty.title")}</b>
        <p className="m-0 max-w-[42ch] text-[13px] text-gray-400">{body}</p>
        {manage}
      </section>
    );
  }
  const pick = picks[Math.min(index, picks.length - 1)];
  return (
    <section aria-label={t("dashboard.wp3a.topPicks.title")} className="relative flex min-h-[240px] flex-col justify-between overflow-hidden rounded-[18px] bg-black px-5 py-[18px]">
      {pick.imageUrl && <img src={pick.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
      <div className="relative"><Label text={t("dashboard.wp3a.topPicks.title")} /></div>
      <div className="relative grid gap-1.5">
        <h3 className="m-0 text-[30px] font-black leading-[1.05] text-gray-50"><button type="button" className="cursor-pointer text-left" onClick={() => onOpenPick(pick)}>{pick.title}</button></h3>
        <div className="text-xs text-gray-200">{pick.subtitle ? `${pick.subtitle} · ` : ""}<span>{t("dashboard.wp3a.topPicks.from", { list: pick.listTitle, interpolation: { escapeValue: false } })}</span></div>
        <div className="flex flex-wrap items-center gap-2">
          {manage}
          <span className="flex-1" />
          <div className="flex gap-1.5">
            {picks.map((item, i) => (
              <button key={item.id} type="button" aria-label={t("dashboard.wp3a.topPicks.show", { name: item.title })} aria-pressed={i === index}
                onClick={() => setIndex(i)}
                className={`h-10 w-[62px] overflow-hidden rounded-md ${i === index ? "border-2 border-white" : "border border-white/40"}`}>
                {item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
