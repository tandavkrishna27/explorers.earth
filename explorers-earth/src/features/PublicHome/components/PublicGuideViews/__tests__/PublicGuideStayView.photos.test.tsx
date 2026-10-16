import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PublicGuideStayView from '../PublicGuideStayView';
const place = (id: string) => ({ id, place_id: 'same-provider', name: id, formatted_address: 'Fixture street', photos: [{ id, documentId: id, url: `/fixture/${id}`, fileName: id, width: 800, height: 600, aspectRatio: '4:3' }] });
const section = (accommodations: unknown[]) => ({ documentId: 'day-one', Sequence: 1, Title: 'Day one', Stay: { accommodations }, Recommendation_Activity: { activities: [] } });
describe('PublicGuideStayView entry photos', () => {
  it.each(['overview', 'day-1'])('renders stay only own photos in overview and selected day', selectedDay => {
    render(<PublicGuideStayView sections={[section([place('stay-own')])]} guide={{}} selectedDay={selectedDay} />);
    screen.getAllByRole('img', { name: 'stay-own' }).forEach(image => expect(image).toHaveAttribute('src', '/fixture/stay-own'));
  });
  it('keeps same provider accommodations separate and uses each own photo', () => {
    render(<PublicGuideStayView sections={[section([place('stay-first'), place('stay-second')])]} guide={{}} selectedDay="day-1" />);
    for (const id of ['stay-first', 'stay-second']) screen.getAllByRole('img', { name: id }).forEach(image => expect(image).toHaveAttribute('src', `/fixture/${id}`));
  });
});
