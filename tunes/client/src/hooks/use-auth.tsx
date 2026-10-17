import { createContext, ReactNode, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAnalytics, AnalyticsEventCategory, AnalyticsEventAction } from "@/hooks/use-analytics";
import { getCsrfToken } from "../lib/csrf";
import {
  saveUserToStorage,
  loadUserFromStorage,
  clearAuthStorage,
  hasValidAuthData,
  checkSSOAuth,
  clearSSOAuth,
  hasValidSSOAuth
} from "../lib/authStorage";
import { useAuthStore } from "@/stores/authStore";
import { musicPrincipalForRequest } from "@/lib/musicCredential";
import { clearPendingMusicPublicationCommands } from "@/lib/musicPublicationCommandRegistry";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
  refetchUser: () => Promise<void>;
  checkEmailVerification: () => boolean;
};

type LoginData = {
  username: string;
  password: string;
  _csrf?: string;
};

export const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  skipAuthCheck?: boolean;
}

export function AuthProvider({ children, skipAuthCheck = false }: AuthProviderProps) {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const isAuthPage = location === "/auth";
  const { trackEvent, setUser: setAnalyticsUser } = useAnalytics();
  const redirectAttempted = useRef(false);
  const logoutInProgress = useRef(false);

  // Always call the Zustand store hook (Rules of Hooks — no conditional calls)
  // Values are only used when skipAuthCheck=true (Strapi auth mode)
  const { user: strapiUser, isAuthenticated: strapiIsAuthenticated } = useAuthStore();

  // When skipAuthCheck is true (new app), fetch from Neon DB instead
  const [localUser, setLocalUser] = useState<SelectUser | null>(() => {
    if (skipAuthCheck) {
      // Will be populated by useEffect below
      return null;
    }

    // Only try to load from storage if not on auth page
    if (isAuthPage) return null;

    // First check for SSO authentication
    const ssoUser = checkSSOAuth();
    if (ssoUser) {
      console.log('✅ Found SSO user on app initialization');
      return ssoUser;
    }

    return loadUserFromStorage();
  });

  // Fetch Neon DB user data reactively whenever Strapi auth state changes.
  // This runs on mount AND any time the user logs in/out via Strapi,
  // fixing the race condition where the effect only ran once at mount time.
  useEffect(() => {
    if (!skipAuthCheck) return;

    if (!strapiIsAuthenticated || !strapiUser?.username) {
      // Logged out — clear local user
      setLocalUser(null);
      return;
    }

    console.log('🔄 Fetching Neon DB user for:', strapiUser.username);
    musicPrincipalForRequest()
      .then(identity => setLocalUser({ ...strapiUser, id: identity.musicUserId } as unknown as SelectUser))
      .catch(err => console.error('Failed to fetch Neon user:', err));







  }, [skipAuthCheck, strapiIsAuthenticated, strapiUser?.username]);

  // Query server for user data, with fallback to local storage
  const {
    data: serverUser,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ 
      on401: "returnNull",
      shouldLog: (status) => {
        if (skipAuthCheck) return false;
        if (status === 401 && isAuthPage) return false;
        return true;
      }
    }),
    retry: (failureCount, error: any) => {
      if (skipAuthCheck || error?.status === 401) return false;
      return failureCount < 3;
    },
    enabled: !skipAuthCheck,
  });

  // React Query v5 removed query-level onError callbacks. Preserve the cached
  // identity fallback without weakening the query's typed result.
  useEffect(() => {
    if (error && localUser) console.log('Using cached user data from local storage due to API error:', error.message);
  }, [error, localUser]);
  
  // Combine server and local data
  const user = serverUser || localUser;
  
  // Check for SSO authentication on auth page and redirect if valid
  useEffect(() => {
    if (isAuthPage && !isLoading && !user && !redirectAttempted.current) {
      const hasSSO = hasValidSSOAuth();
      if (hasSSO) {
        console.log('✅ Valid SSO authentication found on auth page, redirecting to dashboard');
        redirectAttempted.current = true;
        setLocation('/dashboard');
      }
    }
  }, [isAuthPage, isLoading, user, setLocation]);
  
  // Reset redirect flag when location changes
  useEffect(() => {
    redirectAttempted.current = false;
  }, [location]);
  
  // Refetch user data function
  const refetchUser = useCallback(async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      console.log('User data refetched');
    } catch (error) {
      console.error('Error refetching user data:', error);
    }
  }, []);
  
  // Check email verification status
  const checkEmailVerification = useCallback(() => {
    if (!user) return false;
    if (!user.email) return true; // No email to verify
    return !!user.isEmailVerified;
  }, [user]);
  
  // Set user in analytics when user data changes
  useEffect(() => {
    if (user) {
      setAnalyticsUser({
        userId: user.id,
        isHost: true,
        username: user.username,
        hasPlaylists: true // We can refine this later
      });
    }
  }, [user, setAnalyticsUser]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      try {
        // Get CSRF token using our helper function
        const csrfToken = getCsrfToken();
        
        // Add CSRF token to credentials
        const loginData = {
          ...credentials,
          _csrf: csrfToken || ''
        };
        
        console.log('Attempting login with CSRF token:', (csrfToken || '').substring(0, 6) + '...');
        
        const res = await apiRequest("POST", "/api/login", loginData);
        if (!res.ok) {
          const errorData = await res.json();
          
          // Track failed login attempt
          trackEvent({
            category: AnalyticsEventCategory.AUTH,
            action: AnalyticsEventAction.LOGIN,
            label: 'Failed login',
            reason: errorData.message || 'Unknown error'
          });
          
          throw new Error(errorData.message || "Login failed");
        }
        return await res.json();
      } catch (error) {
        console.error('Login error:', error);
        throw error;
      }
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      
      // Save user to local storage for persistence
      saveUserToStorage(user);
      setLocalUser(user);
      
      console.log('User data saved to local storage for session persistence');
      
      // Track successful login event
      trackEvent({
        category: AnalyticsEventCategory.AUTH,
        action: AnalyticsEventAction.LOGIN,
        label: 'Successful login',
        userId: user.id,
        username: user.username
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/user"] }).then(() => {
        // Check if the user has an email that needs verification
        if (user.email && !user.isEmailVerified) {
          // Redirect to verification sent page
          setLocation("/verification-sent");
        } else {
          // Email is verified or not provided, redirect to dashboard
          setLocation("/dashboard");
        }
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      // Get CSRF token using our helper function
      const csrfToken = getCsrfToken();
      
      // Add CSRF token to credentials
      const registerData = {
        ...credentials,
        _csrf: csrfToken || ''
      };
      
      console.log('Attempting registration with CSRF token:', (csrfToken || '').substring(0, 6) + '...');
      
      const res = await apiRequest("POST", "/api/register", registerData);
      if (!res.ok) {
        const errorData = await res.json();
        
        // Track failed registration attempt
        trackEvent({
          category: AnalyticsEventCategory.AUTH,
          action: AnalyticsEventAction.REGISTER,
          label: 'Failed registration',
          reason: errorData.message || 'Unknown error'
        });
        
        throw new Error(errorData.message || "Registration failed");
      }
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      
      // Save user to local storage for persistence
      saveUserToStorage(user);
      setLocalUser(user);
      
      console.log('User data saved to local storage after registration');
      
      // Track successful registration
      trackEvent({
        category: AnalyticsEventCategory.AUTH,
        action: AnalyticsEventAction.REGISTER,
        label: 'Successful registration',
        userId: user.id,
        username: user.username
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/user"] }).then(() => {
        // Check if the user has an email that needs verification
        if (user.email && !user.isEmailVerified) {
          // Redirect to verification sent page
          setLocation("/verification-sent");
        } else {
          // Email is verified or not provided, redirect to dashboard
          setLocation("/dashboard");
        }
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Prevent multiple logout attempts
      if (logoutInProgress.current) {
        console.log('Logout already in progress, skipping');
        return Promise.resolve();
      }
      
      logoutInProgress.current = true;
      
      try {
        // Track logout attempt before we actually logout
        // This way we still have the user information
        if (user) {
          trackEvent({
            category: AnalyticsEventCategory.AUTH,
            action: AnalyticsEventAction.LOGOUT,
            label: 'Logout attempt',
            userId: user.id,
            username: user.username
          });
        }
        
        // Immediately clear React Query cache and local storage before API call
        // This prevents in-flight queries from running during logout transitions
        queryClient.setQueryData(["/api/user"], null);
        queryClient.setQueryData(["/api/user/profile"], null);
        clearAuthStorage();
        clearPendingMusicPublicationCommands();
        setLocalUser(null);
        
        // Get CSRF token using our helper function
        const csrfToken = getCsrfToken();
        
        // Add CSRF token to logout request
        console.log('Attempting logout with CSRF token:', (csrfToken || '').substring(0, 6) + '...');
        
        // Return the promise so it can be awaited
        await apiRequest("POST", "/api/logout", { _csrf: csrfToken || '' });
      } finally {
        // Reset the flag after a delay to allow for cleanup
        setTimeout(() => {
          logoutInProgress.current = false;
        }, 1000);
      }
    },
    onSuccess: () => {
      // Track successful logout
      trackEvent({
        category: AnalyticsEventCategory.AUTH,
        action: AnalyticsEventAction.LOGOUT,
        label: 'Successful logout'
      });
      
      console.log('Local storage and cache cleared');
      
      // Clear all queries and navigate to auth page
      queryClient.clear();
      setTimeout(() => {
        setLocation("/auth");
      }, 0);
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
      
      // Track failed logout
      trackEvent({
        category: AnalyticsEventCategory.AUTH,
        action: AnalyticsEventAction.LOGOUT,
        label: 'Failed logout',
        reason: error.message
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading: !skipAuthCheck && isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        refetchUser,
        checkEmailVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
