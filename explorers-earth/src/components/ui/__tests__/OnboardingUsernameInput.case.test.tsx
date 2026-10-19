import { fireEvent, render, screen } from '@testing-library/react';
import { Formik } from 'formik';
import { describe, expect, it, vi } from 'vitest';
import OnboardingUsernameInput from '../OnboardingUsernameInput';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../../../hooks/useUsernameValidation', () => ({
  useUsernameValidation: () => ({
    isValidating: false,
    validateUsernameWithAvailability: vi.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [], suggestions: [] }),
  }),
}));

describe('OnboardingUsernameInput lowercase notice (ONB-02)', () => {
  it('tells the user capitals were lowercased, and stops once they are gone', () => {
    render(<Formik initialValues={{ username: '' }} onSubmit={() => undefined}><OnboardingUsernameInput name="username" label="Username" /></Formik>);
    const input = screen.getByLabelText('Username') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ab' } });
    expect(input.value).toBe('ab');
    expect(screen.getByTestId('username-lowercase-notice').textContent).toBe('auth.validations.username.willConvertToLowercase');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(screen.queryByTestId('username-lowercase-notice')).toBeNull();
  });
});
