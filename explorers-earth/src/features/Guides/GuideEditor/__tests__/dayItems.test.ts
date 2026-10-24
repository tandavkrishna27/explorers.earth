import {describe, expect, it} from 'vitest';
import {dayChipLabel, groupByTimeLabel, timeLabelText} from '../dayItems';
import type {GuideDayItem} from '../../../../../../tunes/shared/explorersGuideContract';
const n = (localId: string, timeLabel: GuideDayItem['timeLabel']): GuideDayItem => ({kind: 'note', localId, timeLabel, text: localId});

describe('day items (GD-23)', () => {
 it('is a plain numbered list when nothing is labelled', () => {
  expect(groupByTimeLabel([n('a', null), n('b', null)])).toEqual({headed: false, groups: [{heading: null, items: [n('a', null), n('b', null)]}]});
 });
 it('adds a heading before each label change, unlabelled as Any time', () => {
  const g = groupByTimeLabel([n('a', 'morning'), n('b', 'morning'), n('c', null), n('d', '09:30')]);
  expect(g.headed).toBe(true);
  expect(g.groups.map((x) => [x.heading, x.items.map((i) => i.localId)])).toEqual([['Morning', ['a', 'b']], ['9:30', ['d']], ['Any time', ['c']]]);
 });
 it('orders groups Morning, Afternoon, Evening, Night, then Any time last', () => {
  const g = groupByTimeLabel([n('x', null), n('e', 'evening'), n('m', 'morning'), n('ni', 'night'), n('af', 'afternoon'), n('m2', 'morning')]);
  expect(g.groups.map((x) => [x.heading, x.items.map((i) => i.localId)])).toEqual([
   ['Morning', ['m', 'm2']], ['Afternoon', ['af']], ['Evening', ['e']], ['Night', ['ni']], ['Any time', ['x']]]);
 });
 it('formats labels and day chips', () => {
  expect(timeLabelText('night')).toBe('Night');
  expect(timeLabelText('21:05')).toBe('21:05');
  expect(dayChipLabel(0, null)).toBe('Day 1');
  expect(dayChipLabel(1, '2026-12-12', 'en-GB')).toBe('Sun 13 Dec');
 });
});
