import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ImageCropper from '../ImageCropper';
import ImageUpload from '../../features/Profile/components/ImageUpload';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The Instagram profile-photo import called /api/instagram, which the canonical backend
// does not serve, so the edit button goes straight to the device file picker.
describe.each([
  ['ImageCropper', () => <ImageCropper cropType="profileCrop" />],
  ['ImageUpload', () => <ImageUpload cropType="profileCrop" />],
])('%s', (_name, element) => {
  it('opens the device file picker directly and offers no Instagram import', () => {
    const { container } = render(element());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pick = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button'));
    expect(pick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Choose Image Source/)).toBeNull();
    expect(screen.queryByText(/Instagram/i)).toBeNull();
  });
});
