/**
 * /google-auth/callback — completes Strapi Google OAuth for tunes.
 *
 * Strapi (after Google) redirects here with ?access_token=<StrapiJWT>. We load
 * the Strapi profile via GraphQL `me` (REST is CORS-blocked from this origin;
 * GraphQL is allowed), then complete login like regular login does.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { musicCredentialForRequest } from '@/lib/musicCredential';
import {
  STRAPI_GRAPHQL_URL,
  parseAccessToken,
  mapStrapiMeToAuthUser,
} from '@/lib/google-auth';

const ME_QUERY = `query Me { me { id documentId username email blocked } }`;

export default function GoogleAuthRedirect() {
  const [, setLocation] = useLocation();
  const { login } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const token = parseAccessToken(window.location.search);
        if (!token) throw new Error('No access token in callback URL');

        const res = await fetch(STRAPI_GRAPHQL_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query: ME_QUERY }),
        });
        const json = await res.json();
        const me = json?.data?.me;
        if (!me?.username) throw new Error('Could not load your Strapi profile');

        const authUser = mapStrapiMeToAuthUser(me, token);
        login(authUser); // stores qrtoken + user

        // Mirror the Strapi user into tunes' Neon DB (same as regular login).
        // This MUST succeed before /dashboard: the dashboard hooks
        // error if the Neon user is missing — they do NOT re-sync. So a failed
        // sync here would land a first-time Google user on a broken dashboard.
        await musicCredentialForRequest();

        setLocation('/dashboard');
      } catch (e) {
        console.error('[GoogleAuthRedirect]', e);
        setError(e instanceof Error ? e.message : 'Authentication failed');
        setTimeout(() => setLocation('/auth'), 3000);
      }
    };
    run();
  }, [login, setLocation]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-500 text-lg font-semibold">Authentication Failed</div>
          <p className="text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground">Completing Google sign-in...</p>
      </div>
    </div>
  );
}
