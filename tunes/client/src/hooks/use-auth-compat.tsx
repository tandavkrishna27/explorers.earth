/**
 * Auth Compatibility Hook
 * Bridges new Strapi auth with old useAuth interface
 * This allows existing pages to work without modification
 */

import { createContext, ReactNode, useContext, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useStrapiAuth } from '@/hooks/use-strapi-auth';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { musicPrincipalForRequest } from '@/lib/musicCredential';

// Fake user type that matches the old schema for compatibility
interface CompatUser {
  id: number;
  username: string;
  email: string | null;
  venueName: string;
  guestUrl: string;
  theme: { primary: string };
  isEmailVerified: boolean;
  [key: string]: any;
}

type AuthContextType = {
  user: CompatUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: { mutate: (data: any) => void; isPending: boolean };
  logoutMutation: { mutate: () => void; isPending: boolean };
  registerMutation: { mutate: (data: any) => void; isPending: boolean };
  refetchUser: () => Promise<void>;
  checkEmailVerification: () => boolean;
};

export const AuthCompatContext = createContext<AuthContextType | null>(null);

interface AuthCompatProviderProps {
  children: ReactNode;
  skipAuthCheck?: boolean;
}

export function AuthCompatProvider({ children, skipAuthCheck = false }: AuthCompatProviderProps) {
  const { user: strapiUser, isAuthenticated } = useAuthStore();
  const { login, logout, isLoading } = useStrapiAuth();
  const [neonUser, setNeonUser] = useState<CompatUser | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Fetch Neon DB user data when Strapi user is available
  useState(() => {
    if (strapiUser && !neonUser) {
      // Fetch Neon DB user data
      musicPrincipalForRequest()
        .then((identity) => setNeonUser({ ...strapiUser, id: identity.musicUserId } as unknown as CompatUser))
        .catch((err) => {
          console.error('Failed to fetch Neon DB user data:', err);
        });
    }
  });

  // Refetch user data
  const refetchUser = useCallback(async () => {
    if (!strapiUser) return;
    
    try {
      const identity = await musicPrincipalForRequest();
      setNeonUser({ ...strapiUser, id: identity.musicUserId } as unknown as CompatUser);
    } catch (error) {
      console.error('Error refetching user data:', error);
    }
  }, [strapiUser]);

  // Check email verification
  const checkEmailVerification = useCallback(() => {
    if (!strapiUser) return false;
    // Strapi handles email verification
    return true;
  }, [strapiUser]);

  // Login mutation (compatibility wrapper)
  const loginMutation = {
    mutate: async (data: { username: string; password: string }) => {
      await login({ identifier: data.username, password: data.password });
    },
    isPending: isLoading,
  };

  // Logout mutation (compatibility wrapper)
  const logoutMutation = {
    mutate: () => {
      logout();
      setNeonUser(null);
    },
    isPending: false,
  };

  // Register mutation (compatibility wrapper)
  const registerMutation = {
    mutate: async (data: any) => {
      toast({
        title: 'Registration',
        description: 'Please register via Strapi',
        variant: 'destructive',
      });
    },
    isPending: false,
  };

  return (
    <AuthCompatContext.Provider
      value={{
        user: neonUser,
        isLoading,
        error: null,
        loginMutation,
        logoutMutation,
        registerMutation,
        refetchUser,
        checkEmailVerification,
      }}
    >
      {children}
    </AuthCompatContext.Provider>
  );
}

export function useAuthCompat() {
  const context = useContext(AuthCompatContext);
  if (!context) {
    throw new Error('useAuthCompat must be used within an AuthCompatProvider');
  }
  return context;
}
