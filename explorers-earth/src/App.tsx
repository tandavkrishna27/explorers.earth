import { BrowserRouter, useLocation } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import ScrollToTop from "./components/ScrollToTop";
import AccountGenerationCacheReset from "./components/AccountGenerationCacheReset";
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
      <AccountGenerationCacheReset />
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
      <LandingCookieConsent />
    </BrowserRouter>
  );
}

export default App;
