import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DayNavigationView from '../DayNavigationView';

const photo = (id: string) => ({ id, documentId: id, url: `/fixture/${id}`, fileName: id, width: 800, height: 600, aspectRatio: '4:3' });
const place = (id: string, photos = [photo(id)]) => ({ id, place_id: 'same-provider', name: id, formatted_address: 'Fixture street', photos });
const section = (morning: unknown[], activities: unknown[] = []) => ({ documentId: 'day-one', Sequence: 1, Title: 'Day one', Timeline: { morning, afternoon: [], evening: [] }, Recommendation_Activity: { activities } });
describe('DayNavigationView entry photos', () => {
  it.each(['overview', 'day-1'])('renders timeline only own photos in overview and selected day', selectedDay => {
    render(<DayNavigationView sections={[section([place('timeline-own')])]} guide={{}} selectedDay={selectedDay} />);
    const images = screen.getAllByRole('img', { name: 'timeline-own' });
    expect(images.length).toBeGreaterThan(0); images.forEach(image => expect(image).toHaveAttribute('src', '/fixture/timeline-own'));
  });
  it('prefers direct timeline photos while preserving legacy activity fallback', () => {
    render(<DayNavigationView sections={[section([place('direct'), place('empty', [])], [place('old'), place('last', [photo('fallback'), photo('second')])])]} guide={{}} selectedDay="day-1" />);
    screen.getAllByRole('img', { name: 'direct' }).forEach(image => expect(image).toHaveAttribute('src', '/fixture/direct'));
    screen.getAllByRole('img', { name: 'empty' }).forEach(image => expect(image).toHaveAttribute('src', '/fixture/fallback'));
  });
});
