import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import ScrollToTop from "./components/ScrollToTop";
import AuthSyncManager from "./components/AuthSyncManager";
import './i18n'; // Initialize i18n
import ErrorBoundary from "./components/ErrorBoundary";
import CookieConsent from './features/LandingPage/components/CookieConsent';

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthSyncManager />
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
      <CookieConsent />
    </BrowserRouter>
  );
}

export default App;
