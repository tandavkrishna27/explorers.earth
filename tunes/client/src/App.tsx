/**
 * App Component - explorers.earth Auth Model
 * Main app with Apollo Client and new auth system
 */

import { ApolloProvider } from '@apollo/client/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Switch, Route, useLocation } from 'wouter';
import { queryClient } from './lib/queryClient';
import { apolloClient } from './lib/apollo-client';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from './hooks/use-auth';
import { ThemeProvider } from '@/components/theme-provider';
import { AnalyticsProvider } from './hooks/use-analytics';
import AnalyticsTracker from '@/components/analytics-tracker';
import NotFound from '@/pages/not-found';
import NewAuthPage from '@/pages/new-auth-page';
import GoogleCallbackPage from '@/pages/google-callback-page';
import GoogleAuthRedirect from '@/pages/google-auth-redirect';
import PlaylistPage from '@/pages/playlist-page';
import LandingPage from '@/pages/landing-page';
import DashboardPage from '@/pages/dashboard-page';
import SettingsPage from '@/pages/settings-page';
import AdminDashboard from '@/pages/AdminDashboard';
import AnalyticsTest from '@/pages/analytics-test';
import TermsPage from '@/pages/terms-page';
import PrivacyPage from '@/pages/privacy-page';
import VerificationSentPage from '@/pages/verification-sent-page';
import VerifyEmailPage from '@/pages/verify-email-page';
import { NewProtectedRoute } from './lib/new-protected-route';
import NewHeader from '@/components/new-header';

// Define public routes that don't need authentication
const PUBLIC_ROUTES = [
  '/',
  '/auth',
  '/api/connect/google/callback',
  '/google-auth/callback',
  '/playlist',
  '/analytics-test',
  '/terms',
  '/privacy',
  '/verify-email',
];

function Router() {
  const [location] = useLocation();
  const isPublicRoute = PUBLIC_ROUTES.some((route) => location.startsWith(route));

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={LandingPage} />
      <Route path="/auth" component={NewAuthPage} />
      <Route path="/api/connect/google/callback" component={GoogleCallbackPage} />
      <Route path="/google-auth/callback" component={GoogleAuthRedirect} />
      <Route path="/playlist/:guestUrl" component={PlaylistPage} />
      <Route path="/analytics-test" component={AnalyticsTest} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />

      {/* Email verification routes */}
      <Route path="/verification-sent">
        {() => (
          <NewProtectedRoute
            path="/verification-sent"
            component={VerificationSentPage}
            requireAdmin={false}
          />
        )}
      </Route>

      {/* Admin routes */}
      <Route path="/admin/dashboard">
        {() => (
          <NewProtectedRoute
            path="/admin/dashboard"
            component={AdminDashboard}
            requireAdmin={true}
          />
        )}
      </Route>
      <Route path="/admin/seo">
        {() => (
          <NewProtectedRoute path="/admin/seo" component={AdminDashboard} requireAdmin={true} />
        )}
      </Route>
      <Route path="/admin/users/:userId">
        {() => (
          <NewProtectedRoute
            path="/admin/users/:userId"
            component={AdminDashboard}
            requireAdmin={true}
          />
        )}
      </Route>

      {/* Regular user routes */}
      <Route path="/dashboard">
        {() => (
          <NewProtectedRoute
            path="/dashboard"
            component={DashboardPage}
            requireAdmin={false}
          />
        )}
      </Route>
      <Route path="/settings">
        {() => (
          <NewProtectedRoute path="/settings" component={SettingsPage} requireAdmin={false} />
        )}
      </Route>

      {/* 404 route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <QueryClientProvider client={queryClient}>
        <AnalyticsProvider>
          {/* Include old AuthProvider for compatibility, but skip its auth checks */}
          <AuthProvider skipAuthCheck={true}>
            <ThemeProvider>
              <div className="min-h-screen flex flex-col">
                <NewHeader />
                <main className="flex-1 pt-16">
                  <Router />
                </main>
              </div>
              <Toaster />
              <AnalyticsTracker />
            </ThemeProvider>
          </AuthProvider>
        </AnalyticsProvider>
      </QueryClientProvider>
    </ApolloProvider>
  );
}

export default App;
