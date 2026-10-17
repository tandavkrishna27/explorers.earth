/**
 * Zustand Auth Store - explorers.earth Auth Model
 * Stores authentication state with localStorage persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { setMusicCredentialAuthority } from '@/lib/musicCredential';
import { clearPendingMusicPublicationCommands } from '@/lib/musicPublicationCommandRegistry';

export interface AuthUser {
  id: string;
  documentId: string;
  username: string;
  email: string;
  blocked: boolean;
}

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  token: string | null;
  login: (data: { id: string; documentId: string; username: string; email: string; blocked: boolean; token: string }) => void;
  logout: () => void;
  updateUserBlocked: (blocked: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      token: null,
      login: (data) => {
        const { token, ...user } = data;
        setMusicCredentialAuthority(data.documentId);
        // Store token in localStorage under 'qrtoken' key (same as explorers.earth)
        localStorage.setItem('qrtoken', token);
        set({
          isAuthenticated: true,
          user,
          token,
        });
      },
      logout: () => {
        setMusicCredentialAuthority(undefined);
        clearPendingMusicPublicationCommands();
        // Clear all auth data
        localStorage.removeItem('qrtoken');
        localStorage.removeItem('auth-storage');
        localStorage.removeItem('localTunes_session');
        sessionStorage.removeItem('explorers_user_credentials');
        
        // Clear cross-domain SSO keys
        localStorage.removeItem('localtunes_cross_domain_auth');
        
        // Clear cookies
        if (typeof document !== 'undefined') {
          document.cookie = 'localtunes_cross_domain_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          document.cookie = 'cosmic.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          document.cookie = 'connect.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        }
        
        set({
          isAuthenticated: false,
          user: null,
          token: null,
        });
      },
      updateUserBlocked: (blocked) => {
        set((state) => ({
          user: state.user ? { ...state.user, blocked } : null,
        }));
      },
    }),
    {
      name: 'auth-storage', // localStorage key (same as explorers.earth)
      storage: createJSONStorage(() => localStorage),
    }
  )
);
