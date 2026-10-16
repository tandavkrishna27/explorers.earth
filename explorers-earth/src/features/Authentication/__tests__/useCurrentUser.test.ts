import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useAuthStore from '../../../store/store';
import { useCanonicalAccount } from '../../Profile/api/useCanonicalAccount';
import { useCurrentUser, useUserForOnboarding } from '../hooks/useCurrentUser';

vi.mock('../../../store/store', () => ({ default: vi.fn() }));
vi.mock('../../Profile/api/useCanonicalAccount', () => ({ useCanonicalAccount: vi.fn() }));
const account = { id: '00000000-0000-4000-8000-000000000001', handle: 'john', onboardingStatus: 'complete',
  displayName: 'John', accountType: 'Creator', bioPlain: null, additionalAddresses: [], primaryAddress: null,
  publicAddress: null, socialLinks: [], themeSettings: {}, profileImage: undefined, backgroundImage: undefined,
  mobileNumber: null, mobileNumberVisible: false, publicProfile: true, autoPinning: true, revision: 1, feedItems: [] };

describe('useCurrentUser canonical account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) =>
      selector({ user: { id: 'auth-user', username: 'stale-google-name', email: 'j@example.invalid' } }));
    (useCanonicalAccount as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: account, isPending: false, isFetching: false, error: null, refetch: vi.fn(),
    });
  });

  it('uses the canonical handle and account instead of the Google display name', () => {
    const { result } = renderHook(() => useCurrentUser());
    expect(result.current.username).toBe('john');
    expect(result.current.user?.accounts[0].documentId).toBe(account.id);
    expect(result.current.isReady).toBe(true);
  });

  it('passes skip through to the account query', () => {
    renderHook(() => useCurrentUser({ skipQuery: true }));
    expect(useCanonicalAccount).toHaveBeenCalledWith({ skip: true });
  });

  it('uses the same canonical account for onboarding', () => {
    const { result } = renderHook(() => useUserForOnboarding());
    expect(result.current.user?.onboardingStatus).toBe('complete');
    expect(useCanonicalAccount).toHaveBeenCalledWith({ skip: false });
  });

  it('reports unavailable data without guessing incomplete onboarding', () => {
    (useCanonicalAccount as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined, isPending: false, isFetching: false, error: Error('offline'), refetch: vi.fn(),
    });
    const { result } = renderHook(() => useCurrentUser());
    expect(result.current.isReady).toBe(false);
    expect(result.current.error).toBeTruthy();
  });
});
