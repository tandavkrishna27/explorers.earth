import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const editing = vi.hoisted(() => ({ addSection: vi.fn(), saveSection: vi.fn() }));
vi.mock('../../context/GuideEditingProvider', () => ({ useGuideEditing: () => editing }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import GuideSectionForm from '../GuideSectionForm';

afterEach(cleanup);

// UAT GDE-05: the Day number on the edit page looked editable but was ignored on save.
describe('Day number on the section form', () => {
  it('is read-only text, with a pointer to Reorder days, when an existing day is edited', () => {
    render(<MemoryRouter><GuideSectionForm guideDocumentId="g" sectionId="s1" initialData={{ Sequence: 3, Title: 'Old town' }} existingSections={[]} /></MemoryRouter>);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByText('3', { selector: 'output' })).toBeInTheDocument();
    expect(screen.getByText(/use Reorder days on the guide page/i)).toBeInTheDocument();
  });

  it('is an insert position for a new day, defaulting to the next day', () => {
    render(<MemoryRouter><GuideSectionForm guideDocumentId="g" existingSections={[{ Sequence: 1 }, { Sequence: 2 }]} /></MemoryRouter>);
    const day = screen.getByRole('spinbutton');
    expect(day).toHaveValue(3);
    expect(screen.getByText(/Later days move down by one/)).toBeInTheDocument();
  });
});
