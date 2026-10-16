import { describe, it, expect, beforeEach } from 'vitest';
import useSetupStore from '../useSetupStore';

describe('useSetupStore', () => {
  beforeEach(() => {
    // Clear the store state and localStorage before each test
    useSetupStore.setState({ accountScope: null, sessionGeneration: null, isProfileComplete: false, isRecommendationsComplete: false });
    localStorage.clear();
  });

  it('should have initial state as false', () => {
    const state = useSetupStore.getState();
    expect(state.isProfileComplete).toBe(false);
    expect(state.isRecommendationsComplete).toBe(false);
  });

  it('should update setup status when setSetupStatus is called', () => {
    useSetupStore.getState().bindAccount('account-a', 'incomplete');
    useSetupStore.getState().setSetupStatus(true, true, 'account-a');
    
    let state = useSetupStore.getState();
    expect(state.isProfileComplete).toBe(true);
    expect(state.isRecommendationsComplete).toBe(true);

    useSetupStore.getState().setSetupStatus(true, false, 'account-a');
    
    state = useSetupStore.getState();
    expect(state.isProfileComplete).toBe(true);
    expect(state.isRecommendationsComplete).toBe(false);
  });

  it('does not persist account completion authority to localStorage', () => {
    useSetupStore.getState().bindAccount('account-a', 'incomplete');
    useSetupStore.getState().setSetupStatus(true, false, 'account-a');
    
    const storedStr = localStorage.getItem('setup-storage');
    expect(storedStr).not.toBeNull();
    
    if (storedStr) {
      const stored = JSON.parse(storedStr);
      expect(stored.state.isProfileComplete).toBeUndefined();
      expect(stored.state.isRecommendationsComplete).toBeUndefined();
    }
  });

  it('does not carry completion from account A to account B', () => {
    useSetupStore.getState().bindAccount('account-a', 'complete');
    useSetupStore.getState().setSetupStatus(true, true, 'account-a');
    useSetupStore.getState().bindAccount('account-b', 'incomplete');
    expect(useSetupStore.getState().isProfileComplete).toBe(false);
    expect(useSetupStore.getState().isRecommendationsComplete).toBe(false);
    useSetupStore.getState().setSetupStatus(true, true, 'account-a');
    expect(useSetupStore.getState().isRecommendationsComplete).toBe(false);
  });
  it('ignores an unscoped stale completion after logout', () => {
    useSetupStore.getState().bindAccount('account-a', 'complete');
    useSetupStore.setState({ accountScope: null, sessionGeneration: null, isProfileComplete: false, isRecommendationsComplete: false });
    useSetupStore.getState().setSetupStatus(true, true);
    expect(useSetupStore.getState().isRecommendationsComplete).toBe(false);
  });
  it('fences delayed A→B→A completion by the session generation', () => {
    useSetupStore.getState().bindAccount('account-a', 'complete', 1);
    useSetupStore.getState().bindAccount('account-b', 'incomplete', 2);
    useSetupStore.getState().bindAccount('account-a', 'incomplete', 3);
    useSetupStore.getState().setSetupStatus(true, true, 'account-a', 1);
    expect(useSetupStore.getState().isRecommendationsComplete).toBe(false);
    useSetupStore.getState().setSetupStatus(true, true, 'account-a', 3);
    expect(useSetupStore.getState().isRecommendationsComplete).toBe(true);
  });
});
