import { BrowserRouter, useLocation } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import ScrollToTop from "./components/ScrollToTop";
import AuthSyncManager from "./components/AuthSyncManager";
import './i18n'; // Initialize i18n
import ErrorBoundary from "./components/ErrorBoundary";
import CookieConsent from './features/LandingPage/components/CookieConsent';

function LandingCookieConsent() {
  const { pathname } = useLocation();
  return pathname === '/' ? <CookieConsent /> : null;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthSyncManager />
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
      <LandingCookieConsent />
    </BrowserRouter>
  );
}

export default App;
