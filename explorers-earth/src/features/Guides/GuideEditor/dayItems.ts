import type {GuideDayItem, GuideTimeLabel} from '../../../../../tunes/shared/explorersGuideContract';

const WORDS: Record<string, string> = {morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night'};
/** 'night' → 'Night'; '09:30' → '9:30' (as the mock shows). */
export function timeLabelText(label: GuideTimeLabel): string {
 return WORDS[label] ?? label.replace(/^0(\d):/, '$1:');
}
export type DayGroup = {heading: string | null; items: GuideDayItem[]};
const PART_RANK: Record<string, number> = {morning: 0, afternoon: 1, evening: 2, night: 3};
/** Morning < Afternoon < Evening < Night; a clock time sits just after its part of day; unlabelled ("Any time") last. */
function timeRank(label: GuideTimeLabel | null): number {
 if (label === null) return 99;
 if (label in PART_RANK) return PART_RANK[label];
 const [h, m] = label.split(':').map(Number);
 if (!Number.isFinite(h)) return 98;
 const part = h < 12 ? 0 : h < 17 ? 1 : h < 21 ? 2 : 3;
 return part + 0.5 + (h * 60 + (m || 0)) / 10000;
}
/** GD-23: headings only when any item is labelled; items ordered by time of day, a heading before each label change. */
export function groupByTimeLabel(items: readonly GuideDayItem[]): {headed: boolean; groups: DayGroup[]} {
 if (!items.some((i) => i.timeLabel !== null)) return {headed: false, groups: [{heading: null, items: [...items]}]};
 const groups: DayGroup[] = [];
 const ordered = items.map((item, at) => ({item, at})).sort((x, y) => timeRank(x.item.timeLabel) - timeRank(y.item.timeLabel) || x.at - y.at).map((e) => e.item);
 for (const item of ordered) {
  const heading = item.timeLabel === null ? 'Any time' : timeLabelText(item.timeLabel);
  const last = groups[groups.length - 1];
  if (last && last.heading === heading) last.items.push(item); else groups.push({heading, items: [item]});
 }
 return {headed: true, groups};
}
/** GD-20: dates when the trip has a start date (Day 1 keeps it, GD-28), otherwise Day N. */
export function dayChipLabel(index: number, startDate: string | null, locale?: string): string {
 if (!startDate) return `Day ${index + 1}`;
 const date = new Date(`${startDate}T00:00:00Z`);
 date.setUTCDate(date.getUTCDate() + index);
 const weekday = date.toLocaleDateString(locale, {weekday: 'short', timeZone: 'UTC'});
 const day = date.toLocaleDateString(locale, {day: 'numeric', timeZone: 'UTC'});
 const month = date.toLocaleDateString(locale, {month: 'short', timeZone: 'UTC'});
 return `${weekday} ${day} ${month}`;
}
export function itemTitle(item: GuideDayItem): string {
 return item.kind === 'place' ? item.place.name : item.kind === 'listItem' ? item.snapshot.title : item.text;
}
export function itemSourceText(item: GuideDayItem): string {
 return item.kind === 'listItem' ? `from ${item.snapshot.collectionTitle ?? 'my lists'}` : item.kind === 'place' ? 'search' : 'note';
}
