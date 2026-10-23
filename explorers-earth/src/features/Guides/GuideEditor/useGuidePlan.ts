import {useCallback, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {toast} from 'sonner';
import {explorersApiClient, ExplorersApiError} from '../../../lib/explorersApiClient';
import {GuidesClient, type GuideObservation} from '../api/guidesClient';
import type {GuideAggregateDto, GuideDayItem, GuideDayItemInput, GuideTimeLabel} from '../../../../../tunes/shared/explorersGuideContract';

type Call = (id: string, revision: number, key: string) => Promise<unknown>;
type Section = GuideAggregateDto['sections'][number];
const toInput = (item: GuideDayItem): GuideDayItemInput => item.kind === 'place' ? {kind: 'place', timeLabel: item.timeLabel, place: item.place}
 : item.kind === 'note' ? {kind: 'note', timeLabel: item.timeLabel, text: item.text}
 : {kind: 'listItem', timeLabel: item.timeLabel, ref: {recommendationId: item.ref.recommendationId, collectionId: item.ref.collectionId}};

/** A price or a route on the item is not carried back by re-adding or moving it, so Undo would silently lose it. */
const touchesItemData = (section: Section | undefined, localId: string) => !!section && (
 section.blocks.budget.entries.some((e) => e.localId === localId)
 || section.blocks.transport.segments.some((s) => s.fromLocalId === localId || s.toLocalId === localId));
/** The day commands restore a title and items only; anything else on the day would be lost by an Undo. */
const onlyTitleAndItems = (section: Section) => {
 const b = section.blocks;
 return !section.description && b.transport.segments.length === 0 && b.stay.accommodations.length === 0 && b.activities.activities.length === 0
  && b.budget.entries.length === 0 && b.mapDetails === null && b.packingList.items.length === 0 && b.preTasks.items.length === 0 && b.tags.length === 0;
};

/**
 * Every plan action is one server command (GD-24..30). Commands run strictly one after another,
 * each against the revision the previous one returned, so fast clicks never 409 each other.
 * A failure keeps the last good guide (the UI snaps back) and offers Retry; a 409 first re-reads
 * the whole guide so Retry runs against the fresh revision. Moves and deletes offer Undo only
 * when Undo can restore everything.
 * It holds the branded observation GuidesClient issues (prepareIntent refuses anything else) and exposes its aggregate as guide.
 */
export function useGuidePlan(initial: GuideObservation) {
 const {t} = useTranslation();
 // send is stable across renders, so it reads the current t through a ref.
 const tr = useRef(t);
 tr.current = t;
 const movedTo = (day: number) => t('dashboard.wp9.movedToDay', {defaultValue: 'Moved to Day {{day}}', day});
 const [observation, setObservation] = useState(initial);
 const current = useRef(initial);
 const queue = useRef<Promise<unknown>>(Promise.resolve());
 const sections = () => current.current.aggregate.sections;
 const dayNumber = (sectionId: string) => sections().findIndex((s) => s.id === sectionId) + 1;
 const replace = useCallback((next: GuideObservation) => {current.current = next; setObservation(next);}, []);

 const send = useCallback((call: Call, done?: {message: string; undo?: () => void}): Promise<boolean> => {
  const next = queue.current.then(async () => {
   try {
    const updated = await GuidesClient.run(GuidesClient.prepareIntent(current.current), call);
    replace(updated);
    if (done) toast.success(done.message, done.undo ? {action: {label: tr.current('dashboard.wp9.undo', {defaultValue: 'Undo'}), onClick: done.undo}} : undefined);
    return true;
   } catch (failure) {
    if (failure instanceof ExplorersApiError && failure.status === 409) {
     try {replace(await GuidesClient.observeWholeGuide(current.current.collectionId));} catch {/* keep the last good guide */}
    }
    setObservation(current.current);
    toast.error(tr.current('dashboard.wp9.saveFailed', {defaultValue: "Couldn't save that change"}),
     {action: {label: tr.current('dashboard.wp9.retry', {defaultValue: 'Retry'}), onClick: () => void send(call, done)}});
    return false;
   }
  });
  queue.current = next;
  return next;
 }, [replace]);

 const addDay = (at?: number) => send((id, revision, key) => explorersApiClient.addMyGuideDay(id, {revision, ...(at === undefined ? {} : {at})}, key));
 const moveDay = (sectionId: string, toIndex: number, fromIndex: number): Promise<boolean> => send(
  (id, revision, key) => explorersApiClient.moveMyGuideDay(id, sectionId, {revision, toIndex}, key),
  {message: movedTo(toIndex + 1), undo: () => void moveDay(sectionId, fromIndex, toIndex)});
 const duplicateDay = (sectionId: string) => send((id, revision, key) => explorersApiClient.duplicateMyGuideDay(id, sectionId, revision, key));
 const clearDay = (sectionId: string) => send((id, revision, key) => explorersApiClient.clearMyGuideDay(id, sectionId, revision, key));
 /** Undo goes through the day commands so numberOfDays stays in step: the day comes back at its index with its title, then its items. */
 const restoreDay = async (index: number, section: Section) => {
  if (!await send((id, revision, key) => explorersApiClient.addMyGuideDay(id, {revision, at: index, title: section.title}, key))) return;
  const restored = sections()[index];
  if (!restored) return;
  for (const [at, item] of section.blocks.items.entries()) {
   if (!await send((id, revision, key) => explorersApiClient.addMyGuideDayItem(id, restored.id, {revision, item: toInput(item), at}, key))) return;
  }
 };
 const deleteDay = (sectionId: string) => {
  const index = sections().findIndex((s) => s.id === sectionId);
  const section = sections()[index];
  return send((id, revision, key) => explorersApiClient.deleteMyGuideDay(id, sectionId, revision, key), section && {
   message: t('dashboard.wp9.dayDeleted', {defaultValue: 'Day deleted'}), ...(onlyTitleAndItems(section) ? {undo: () => void restoreDay(index, section)} : {})});
 };
 const addItem = (sectionId: string, item: GuideDayItemInput, at?: number) => send(
  (id, revision, key) => explorersApiClient.addMyGuideDayItem(id, sectionId, {revision, item, ...(at === undefined ? {} : {at})}, key),
  {message: t('dashboard.wp9.addedToDay', {defaultValue: 'Added to Day {{day}}', day: dayNumber(sectionId)})});
 const moveItem = (fromSectionId: string, localId: string, toSectionId: string, toIndex: number, origin: {fromIndex: number}): Promise<boolean> => {
  const lossy = touchesItemData(sections().find((s) => s.id === fromSectionId), localId);
  return send(
   (id, revision, key) => explorersApiClient.moveMyGuideDayItem(id, fromSectionId, localId, {revision, toSectionId, toIndex}, key),
   fromSectionId === toSectionId ? {message: t('dashboard.wp9.orderSaved', {defaultValue: 'Order saved'})} : {message: movedTo(dayNumber(toSectionId)),
    ...(lossy ? {} : {undo: () => void moveItem(toSectionId, localId, fromSectionId, origin.fromIndex, {fromIndex: toIndex})})});
 };
 const setTimeLabel = (sectionId: string, localId: string, timeLabel: GuideTimeLabel | null) =>
  send((id, revision, key) => explorersApiClient.setMyGuideTimeLabel(id, sectionId, localId, {revision, timeLabel}, key));
 const setNoteText = (sectionId: string, localId: string, text: string) =>
  send((id, revision, key) => explorersApiClient.setMyGuideNoteText(id, sectionId, localId, {revision, text}, key));
 const removeItem = (sectionId: string, localId: string, origin: {index: number; item: GuideDayItem}) => {
  const lossy = touchesItemData(sections().find((s) => s.id === sectionId), localId);
  return send(
   (id, revision, key) => explorersApiClient.removeMyGuideDayItem(id, sectionId, localId, revision, key),
   {message: t('dashboard.wp9.removedFromGuide', {defaultValue: 'Removed from guide'}), ...(lossy ? {} : {undo: () => void addItem(sectionId, toInput(origin.item), origin.index)})});
 };
 const guide: GuideAggregateDto = observation.aggregate;

 return {guide, observation, replace, addDay, moveDay, duplicateDay, clearDay, deleteDay, addItem, moveItem, setTimeLabel, setNoteText, removeItem};
}
