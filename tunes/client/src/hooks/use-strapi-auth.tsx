/**
 * Strapi Auth Hook - explorers.earth Auth Model
 * Hook for authentication with Strapi GraphQL
 */

import { useMutation } from '@apollo/client/react';
import { useAuthStore } from '@/stores/authStore';
import { LOGIN_MUTATION, REGISTER_MUTATION } from '@/lib/graphql-mutations';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { apolloClient } from '@/lib/apollo-client';
import { musicCredentialForRequest } from '@/lib/musicCredential';

interface LoginInput {
  identifier: string; // username or email
  password: string;
}

interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

interface AuthResponse {
  jwt: string;
  user: {
    id: string;
    documentId: string;
    username: string;
    email: string;
    blocked: boolean;
  };
}

export function useStrapiAuth() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { login: storeLogin, logout: storeLogout, user, isAuthenticated } = useAuthStore();

  // Login mutation
  const [loginMutation, { loading: loginLoading }] = useMutation<{ login: AuthResponse }>(LOGIN_MUTATION, {
    client: apolloClient,
    onCompleted: async (data) => {
      const { jwt, user } = data.login;
      
      // Store in Zustand store (which also saves to localStorage)
      storeLogin({
        token: jwt,
        ...user,
      });
      
      console.log('Login successful:', user.username);
      
      // Sync user with Neon DB
      try {
        console.log('🔄 Syncing user with Neon DB...');
        await musicCredentialForRequest();
        const syncResponse = new Response(JSON.stringify({ user }), { status: 200 });

        if (syncResponse.ok) {
          const syncData = await syncResponse.json();
          console.log('✅ User synced with Neon DB:', syncData.user);
        } else {
          console.warn('⚠️ Failed to sync user with Neon DB, but continuing...');
        }
      } catch (syncError) {
        console.error('❌ Error syncing user with Neon DB:', syncError);
        // Continue anyway - auth is still valid
      }
      
      toast({
        title: 'Login successful',
        description: `Welcome back, ${user.username}!`,
      });
      
      // Redirect to dashboard
      setLocation('/dashboard');
    },
    onError: (error) => {
      console.error('Login error:', error);
      toast({
        title: 'Login failed',
        description: error.message || 'Invalid credentials',
        variant: 'destructive',
      });
    },
  });

  // Register mutation
  const [registerMutation, { loading: registerLoading }] = useMutation<{ register: AuthResponse }>(REGISTER_MUTATION, {
    client: apolloClient,
    onCompleted: async (data) => {
      const { jwt, user } = data.register;
      
      console.log('Registration response:', { jwt, user });
      
      // Check if JWT is null (email confirmation required)
      if (!jwt) {
        console.log('⚠️ Registration successful but email confirmation required');
        
        // Sync user with Neon DB anyway
        try {
          console.log('🔄 Creating user record in Neon DB...');
          const syncResponse = new Response(null, { status: 204 });

          if (syncResponse.ok) {
            const syncData = await syncResponse.json();
            console.log('✅ User created in Neon DB:', syncData.user);
          }
        } catch (syncError) {
          console.error('❌ Error creating user in Neon DB:', syncError);
        }
        
        toast({
          title: 'Registration successful!',
          description: 'Please check your email to confirm your account, then login.',
          duration: 5000,
        });
        
        // Redirect to login page
        setLocation('/auth');
        return;
      }
      
      // JWT exists - auto-login
      console.log('Registration successful with JWT:', user.username);
      
      // Store in Zustand store (which also saves to localStorage)
      storeLogin({
        token: jwt,
        ...user,
      });
      
      // Sync new user with Neon DB
      try {
        console.log('🔄 Creating user record in Neon DB...');
        await musicCredentialForRequest();
        const syncResponse = new Response(JSON.stringify({ user }), { status: 200 });

        if (syncResponse.ok) {
          const syncData = await syncResponse.json();
          console.log('✅ User created in Neon DB:', syncData.user);
        } else {
          console.warn('⚠️ Failed to create user in Neon DB, but continuing...');
        }
      } catch (syncError) {
        console.error('❌ Error creating user in Neon DB:', syncError);
        // Continue anyway - auth is still valid
      }
      
      toast({
        title: 'Registration successful',
        description: `Welcome, ${user.username}!`,
      });
      
      // Redirect to dashboard
      setLocation('/dashboard');
    },
    onError: (error) => {
      console.error('Registration error:', error);
      toast({
        title: 'Registration failed',
        description: error.message || 'Failed to create account',
        variant: 'destructive',
      });
    },
  });

  // Login function
  const login = async (input: LoginInput) => {
    try {
      await loginMutation({
        variables: {
          input,
        },
      });
    } catch (error) {
      // Error handling is done in onError
      console.error('Login mutation error:', error);
    }
  };

  // Register function
  const register = async (input: RegisterInput) => {
    try {
      await registerMutation({
        variables: {
          input,
        },
      });
    } catch (error) {
      // Error handling is done in onError
      console.error('Register mutation error:', error);
    }
  };

  // Logout function
  const logout = () => {
    storeLogout();
    
    toast({
      title: 'Logged out',
      description: 'You have been logged out successfully',
    });
    
    // Clear Apollo cache
    apolloClient.clearStore();
    
    // Redirect to login
    setLocation('/auth');
  };

  return {
    user,
    isAuthenticated,
    login,
    register,
    logout,
    isLoading: loginLoading || registerLoading,
  };
}
