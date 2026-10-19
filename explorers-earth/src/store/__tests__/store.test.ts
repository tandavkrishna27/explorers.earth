import { describe, it, expect, beforeEach, vi } from 'vitest';
import useAuthStore, { broadcastSessionLogout } from '../store';

describe('useAuthStore', () => {
  const initialData = {
    id: 'user123',
    documentId: 'doc123',
    username: 'testuser',
    email: 'test@example.com',
    blocked: false,
    token: 'fake-jwt-token'
  };

  beforeEach(() => {
    // Clear the store and localStorage before each test
    useAuthStore.getState().logout();
    localStorage.clear();
  });

  it('should have correct initial state', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });

  it('should update state on login', () => {
    useAuthStore.getState().login(initialData);
    const state = useAuthStore.getState();

    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('fake-jwt-token');
    expect(state.user).toEqual({
      id: 'user123',
      documentId: 'doc123',
      username: 'testuser',
      email: 'test@example.com',
      blocked: false
    });
  });

  it('should clear state on logout', () => {
    // First login
    useAuthStore.getState().login(initialData);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    // Then logout
    useAuthStore.getState().logout();
    const state = useAuthStore.getState();

    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });

  it('should update user blocked status', () => {
    // Login
    useAuthStore.getState().login(initialData);
    
    // Update blocked status
    useAuthStore.getState().updateUserBlocked(true);
    
    let state = useAuthStore.getState();
    expect(state.user?.blocked).toBe(true);
    
    // Update blocked status again
    useAuthStore.getState().updateUserBlocked(false);
    
    state = useAuthStore.getState();
    expect(state.user?.blocked).toBe(false);
  });

  it('should not update user blocked status if user is null', () => {
    useAuthStore.getState().updateUserBlocked(true);
    const state = useAuthStore.getState();
    
    expect(state.user).toBeNull();
  });

  it('does not persist browser authority to localStorage', () => {
    useAuthStore.getState().login(initialData);
    const storedStr = localStorage.getItem('auth-storage');
    if (storedStr) {
      const stored = JSON.parse(storedStr);
      expect(stored.state).not.toHaveProperty('isAuthenticated');
      expect(stored.state).not.toHaveProperty('token');
      expect(stored.state).not.toHaveProperty('user');
    }
  });

  it('does not revive a persisted Strapi credential or grant owner access before session verification', () => {
    localStorage.setItem('auth-storage', JSON.stringify({ state: {
      isAuthenticated: true, token: 'old-jwt', user: initialData,
    }, version: 0 }));
    useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('rejects an old verification result after an A to B to A session change', () => {
    const oldGeneration = useAuthStore.getState().beginVerification();
    useAuthStore.getState().logout();
    const nextGeneration = useAuthStore.getState().beginVerification();
    expect(nextGeneration).not.toBe(oldGeneration);
    useAuthStore.getState().acceptVerified(oldGeneration, {
      id: 'account-a', userId: 'user-a', username: 'A', email: 'a@example.invalid', onboardingStatus: 'complete', revision: 1,
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('signs this tab out when another tab announces a logout, once per event', () => {
    // Regression: the Music session boundary carried this until P3-4 removed it, after
    // which a receiving tab kept rendering owner pages on a revoked session.
    useAuthStore.getState().login(initialData);
    const before = useAuthStore.getState().generation;
    window.dispatchEvent(new StorageEvent('storage', { key: 'explorers-session-logout', newValue: 'event-1' }));
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed-out', isAuthenticated: false, user: null });
    expect(useAuthStore.getState().generation).toBe(before + 1);
    useAuthStore.getState().login(initialData);
    window.dispatchEvent(new StorageEvent('storage', { key: 'explorers-session-logout', newValue: 'event-1' }));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('ignores the storage removal that follows an announcement', () => {
    useAuthStore.getState().login(initialData);
    window.dispatchEvent(new StorageEvent('storage', { key: 'explorers-session-logout', newValue: null }));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('announces a logout to other tabs without signing out the announcing tab twice', () => {
    const setItem = vi.spyOn(localStorage, 'setItem');
    useAuthStore.getState().login(initialData);
    broadcastSessionLogout();
    const announced = setItem.mock.calls.find(([key]) => key === 'explorers-session-logout');
    expect(announced?.[1]).toEqual(expect.any(String));
    expect(localStorage.getItem('explorers-session-logout')).toBeNull();
    // Its own id is already seen, so an echo cannot bump this tab's generation.
    window.dispatchEvent(new StorageEvent('storage', { key: 'explorers-session-logout', newValue: announced![1] }));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    setItem.mockRestore();
  });
});
