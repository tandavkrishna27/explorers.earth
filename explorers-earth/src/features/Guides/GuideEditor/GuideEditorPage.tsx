import {useMemo, useState, useEffect} from 'react';
import {useNavigate, useParams, useLocation} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {toast} from 'sonner';
import PublishPill from '../../../components/controls/PublishPill';
import BottomAddButton from '../../../components/controls/BottomAddButton';
import ShareTab from '../../shared/list/ShareTab';
import ManageTab from '../../shared/list/ManageTab';
import useAuthStore from '../../../store/store';
import type {CollectionObservation} from '../../../lib/explorersApiClient';
import {useGuidesOwner} from '../hooks/useGuidesOwner';
import type {GuideObservation} from '../api/guidesClient';
import type {GuideDayItemInput} from '../../../../../tunes/shared/explorersGuideContract';
import type {LinkedListCard} from '../../../../../tunes/shared/explorersListLinkContract';
import {useGuidePlan} from './useGuidePlan';
import DayStrip from './DayStrip';
import DayList from './DayList';
import SmartAddBox from './SmartAddBox';
import MyListsPanel, {type PanelList} from './MyListsPanel';
import PlanChips, {type PlanSection} from './PlanChips';
import LinkedListsBlock from './LinkedListsBlock';
import {dayChipLabel} from './dayItems';
import {guideListAdapter} from './guideListAdapter';

type Tab = 'plan' | 'share' | 'manage';
type GuideRow = {documentId: string; Title: string; Description?: string; slug?: string; Visibility?: boolean; isSample?: boolean};

export default function GuideEditorPage() {
 const {t} = useTranslation();
 const {guideId = ''} = useParams();
 const owner = useGuidesOwner(guideId, true, {keepWhileRefreshing: true});
 if (owner.loading && !owner.observation) return <div aria-busy="true" className="mx-auto max-w-5xl space-y-4 p-4">{[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-100" />)}</div>;
 if (owner.error || !owner.observation || !owner.guide) return (
  <div role="alert" className="p-6">{t('dashboard.wp9.loadFailed', {defaultValue: "Couldn't load this guide."})}{' '}
   <button type="button" onClick={owner.refresh} className="underline">{t('dashboard.wp9.retry', {defaultValue: 'Retry'})}</button></div>);
 return <Editor key={guideId} initial={owner.observation} guide={owner.guide as unknown as GuideRow}
  list={owner.content?.lists.get(guideId)} refresh={owner.refresh} />;
}

function Editor({initial, guide, list, refresh}: {initial: GuideObservation; guide: GuideRow; list: CollectionObservation | undefined; refresh: () => void}) {
 const {t, i18n} = useTranslation();
 const navigate = useNavigate();
 const location = useLocation();
 const username = useAuthStore((state) => (state.user as {username?: string} | null)?.username);
 const plan = useGuidePlan(initial);
 const g = plan.guide;
 const [tab, setTab] = useState<Tab>(((location.state as {tab?: Tab} | null)?.tab) ?? 'plan');
 const [section, setSection] = useState<PlanSection>('itinerary');
 const [selected, setSelected] = useState(g.sections[0]?.id ?? '');
 const [adding, setAdding] = useState<string | null>(null);
 const [lists] = useState<PanelList[]>([]);           // filled from the owner's lists (getAllMyCollections per category) on first panel open
 const [links] = useState<LinkedListCard[]>([]);      // [DEPENDS: WP10 — readListLinksForCollection via an owner route]
 useEffect(() => {if (!g.sections.some((s) => s.id === selected)) setSelected(g.sections[0]?.id ?? '');}, [g.sections, selected]);
 const days = useMemo(() => g.sections.map((s) => ({id: s.id, title: s.title, items: s.blocks.items})), [g.sections]);
 const index = Math.max(0, days.findIndex((d) => d.id === selected));
 const dayName = (i: number) => dayChipLabel(i, g.details.startDate, i18n.language);
 const place = g.details.place as {name?: string};
 const meta = [place?.name || null, `${days.length} ${days.length === 1 ? 'day' : 'days'}`].filter(Boolean).join(' · ');
 const add = (sectionId: string) => (item: GuideDayItemInput) => void plan.addItem(sectionId, item);
 const filled = {
  stay: g.sections.some((s) => s.blocks.stay.accommodations.length > 0), transport: g.sections.some((s) => s.blocks.transport.segments.length > 0),
  budget: g.sections.some((s) => s.blocks.budget.entries.length > 0), tips: g.details.tipsNotes != null,
 };
 const adapter = useMemo(() => guideListAdapter({guide, list, dayCount: days.length, username, refresh}), [guide, list, days.length, username, refresh]);
 const setStatus = async (next: 'draft' | 'public') => {
  try {
   await adapter.setStatus(next);
   toast.success(next === 'public' ? t('dashboard.wp9.nowPublic', {defaultValue: 'Guide is now Public'}) : t('dashboard.wp9.nowDraft', {defaultValue: 'Guide is now Draft'}));
  } catch (failure) {
   toast.error(failure instanceof Error ? failure.message : t('dashboard.wp9.statusFailed', {defaultValue: "Couldn't change the status."}));
  }
 };
 return (
  <div className="mx-auto max-w-6xl px-4 pb-28">
   <button type="button" onClick={() => navigate((location.state as {from?: {pathname: string}} | null)?.from?.pathname ?? '/recommendations/guides')} className="mt-4 text-xs font-semibold tracking-wide text-gray-500">
    ‹ {t('dashboard.wp9.back', {defaultValue: 'BACK TO GUIDES'})}</button>
   <header className="mt-2 flex items-start gap-3">
    <div className="min-w-0 flex-1">
     <h1 className="line-clamp-2 text-2xl font-semibold" title={guide.Title}>{guide.Title}</h1>
     <p className="text-sm text-gray-600">{meta}</p>
    </div>
    <PublishPill kind="guide" value={guide.Visibility ? 'public' : 'draft'} privateComingSoon disabled={guide.isSample === true} onChange={setStatus} />
   </header>
   <div role="tablist" className="mt-4 flex gap-4 border-b">
    {(['plan', 'share', 'manage'] as const).map((k) => (
     <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
      className={`min-h-[44px] px-1 text-sm ${tab === k ? 'border-b-2 border-gray-900 font-semibold' : 'text-gray-500'}`}>
      {t(`dashboard.wp9.tab.${k}`, {defaultValue: k === 'plan' ? 'Plan' : k === 'share' ? 'Share' : 'Manage'})}</button>
    ))}
   </div>
   <div hidden={tab !== 'plan'}>
    <div className="mt-4"><PlanChips filled={filled} active={section} onSelect={setSection} /></div>
    <DayStrip days={days} startDate={g.details.startDate} selectedId={selected} onSelect={setSelected} onAddDay={() => void plan.addDay()}
     onDropItem={(from, localId, to, fromIndex) => void plan.moveItem(from, localId, to, days.find((d) => d.id === to)?.items.length ?? 0, {fromIndex})} />
    <div className="mt-4 flex flex-col gap-6 md:flex-row">
     <div className="min-w-0 flex-1">
      {section === 'itinerary' ? (
       <DayList days={days} startDate={g.details.startDate}
        addBox={(id) => adding === id ? <SmartAddBox dayName={dayName(days.findIndex((d) => d.id === id))} onAdd={add(id)} onClose={() => setAdding(null)} /> : null}
        onOpenAdd={setAdding} onMoveItem={(...a) => void plan.moveItem(...a)} onSetTimeLabel={(...a) => void plan.setTimeLabel(...a)}
        onRemoveItem={(...a) => void plan.removeItem(...a)} onEditNote={(...a) => void plan.setNoteText(...a)}
        onDropNew={(sectionId, toIndex, ref) => void plan.addItem(sectionId, {kind: 'listItem', timeLabel: null, ref}, toIndex)}
        onInsertDay={(at) => void plan.addDay(at)} onDuplicateDay={(id) => void plan.duplicateDay(id)} onClearDay={(id) => void plan.clearDay(id)}
        onDeleteDay={(id) => void plan.deleteDay(id)} onMoveDay={(id, to, from) => void plan.moveDay(id, to, from)} />
      ) : (
       <p className="rounded-lg border border-dashed p-4 text-sm text-gray-600">
        {t('dashboard.wp9.sectionSoon', {defaultValue: 'This section opens in the guide details editor for now.'})}</p>
      )}
      <button type="button" onClick={() => void plan.addDay()} className="mt-4 hidden min-h-[44px] rounded-lg border border-dashed px-4 text-sm md:inline-block">
       {t('dashboard.wp9.addDay', {defaultValue: '+ Add day'})}</button>
      <LinkedListsBlock links={links} onOpen={(card) => navigate(`/recommendations/${card.collection.category}?list=${card.collection.id}`, {state: {from: location}})} />
     </div>
     <div className="hidden md:block"><MyListsPanel lists={lists} selectedDayName={dayName(index)} onAdd={add(selected)}
      map={<p className="p-3 text-sm text-gray-500">{t('dashboard.wp9.mapSoon', {defaultValue: 'Map view is coming soon.'})}</p>} /></div>
    </div>
    <BottomAddButton label={t('dashboard.wp9.addToDayButton', {defaultValue: '+ Add to {{day}}', day: dayName(index)})} onClick={() => setAdding(selected)} hidden={tab !== 'plan'} />
   </div>
   <div hidden={tab !== 'share'}><ShareTab adapter={adapter} /></div>
   <div hidden={tab !== 'manage'}><ManageTab adapter={adapter} /></div>
  </div>
 );
}
