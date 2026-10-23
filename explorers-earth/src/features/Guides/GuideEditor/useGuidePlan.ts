import {useCallback, useRef, useState} from 'react';
import {toast} from 'sonner';
import {explorersApiClient} from '../../../lib/explorersApiClient';
import {GuidesClient} from '../api/guidesClient';
import type {GuideAggregateDto, GuideDayItem, GuideDayItemInput, GuideTimeLabel} from '../../../../../tunes/shared/explorersGuideContract';

type Call = (id: string, revision: number, key: string) => Promise<unknown>;
const toInput = (item: GuideDayItem): GuideDayItemInput => item.kind === 'place' ? {kind: 'place', timeLabel: item.timeLabel, place: item.place}
 : item.kind === 'note' ? {kind: 'note', timeLabel: item.timeLabel, text: item.text}
 : {kind: 'listItem', timeLabel: item.timeLabel, ref: {recommendationId: item.ref.recommendationId, collectionId: item.ref.collectionId}};

/**
 * Every plan action is one server command (GD-24..30). Commands run strictly one after another,
 * each against the revision the previous one returned, so fast clicks never 409 each other.
 * A failure keeps the last good guide (the UI snaps back) and offers Retry; moves and deletes offer Undo.
 */
export function useGuidePlan(initial: GuideAggregateDto) {
 const [guide, setGuide] = useState(initial);
 const current = useRef(initial);
 const queue = useRef<Promise<unknown>>(Promise.resolve());
 const dayNumber = (sectionId: string) => current.current.sections.findIndex((s) => s.id === sectionId) + 1;

 const send = useCallback((call: Call, done?: {message: string; undo?: () => void}): Promise<void> => {
  const next = queue.current.then(async () => {
   try {
    const updated = await GuidesClient.run(GuidesClient.prepareIntent(current.current as never), call) as GuideAggregateDto;
    current.current = updated; setGuide(updated);
    if (done) toast.success(done.message, done.undo ? {action: {label: 'Undo', onClick: done.undo}} : undefined);
   } catch {
    setGuide(current.current);
    toast.error("Couldn't save that change", {action: {label: 'Retry', onClick: () => void send(call, done)}});
   }
  });
  queue.current = next;
  return next;
 }, []);

 const addDay = (at?: number) => send((id, revision, key) => explorersApiClient.addMyGuideDay(id, {revision, ...(at === undefined ? {} : {at})}, key));
 const moveDay = (sectionId: string, toIndex: number, fromIndex: number) => send(
  (id, revision, key) => explorersApiClient.moveMyGuideDay(id, sectionId, {revision, toIndex}, key),
  {message: `Moved to Day ${toIndex + 1}`, undo: () => void moveDay(sectionId, fromIndex, toIndex)});
 const duplicateDay = (sectionId: string) => send((id, revision, key) => explorersApiClient.duplicateMyGuideDay(id, sectionId, revision, key));
 const clearDay = (sectionId: string) => send((id, revision, key) => explorersApiClient.clearMyGuideDay(id, sectionId, revision, key));
 const deleteDay = (sectionId: string) => {
  const section = current.current.sections.find((s) => s.id === sectionId);
  return send((id, revision, key) => explorersApiClient.deleteMyGuideDay(id, sectionId, revision, key), section && {
   message: 'Day deleted', undo: () => void send((id, revision, key) => explorersApiClient.addMyGuideSection(id,
    {revision, title: section.title, description: section.description, blocks: section.blocks, position: section.displayOrder}, key))});
 };
 const addItem = (sectionId: string, item: GuideDayItemInput, at?: number) => send(
  (id, revision, key) => explorersApiClient.addMyGuideDayItem(id, sectionId, {revision, item, ...(at === undefined ? {} : {at})}, key),
  {message: `Added to Day ${dayNumber(sectionId)}`});
 const moveItem = (fromSectionId: string, localId: string, toSectionId: string, toIndex: number, origin: {fromIndex: number}) => send(
  (id, revision, key) => explorersApiClient.moveMyGuideDayItem(id, fromSectionId, localId, {revision, toSectionId, toIndex}, key),
  fromSectionId === toSectionId ? {message: 'Order saved'} : {message: `Moved to Day ${dayNumber(toSectionId)}`,
   undo: () => void moveItem(toSectionId, localId, fromSectionId, origin.fromIndex, {fromIndex: toIndex})});
 const setTimeLabel = (sectionId: string, localId: string, timeLabel: GuideTimeLabel | null) =>
  send((id, revision, key) => explorersApiClient.setMyGuideTimeLabel(id, sectionId, localId, {revision, timeLabel}, key));
 const setNoteText = (sectionId: string, localId: string, text: string) =>
  send((id, revision, key) => explorersApiClient.setMyGuideNoteText(id, sectionId, localId, {revision, text}, key));
 const removeItem = (sectionId: string, localId: string, origin: {index: number; item: GuideDayItem}) => send(
  (id, revision, key) => explorersApiClient.removeMyGuideDayItem(id, sectionId, localId, revision, key),
  {message: 'Removed from guide', undo: () => void addItem(sectionId, toInput(origin.item), origin.index)});
 const replace = (next: GuideAggregateDto) => {current.current = next; setGuide(next);};

 return {guide, replace, addDay, moveDay, duplicateDay, clearDay, deleteDay, addItem, moveItem, setTimeLabel, setNoteText, removeItem};
}
