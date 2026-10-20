import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";
import GuestRoute from "../components/GuestRoute";

const Login = lazy(() => import("../pages/Login"));
const GoogleAuthRedirect = lazy(() => import("../pages/GoogleAuthRedirect"));
const Landing = lazy(() => import("../pages/Landing"));
const Contact = lazy(() => import("../pages/Contact"));
const About = lazy(() => import("../pages/About"));
const UseCases = lazy(() => import("../pages/UseCases"));
const Privacy = lazy(() => import("../pages/Privacy"));
const Cookies = lazy(() => import("../pages/Cookies"));
const Terms = lazy(() => import("../pages/Terms"));
const ReactivateAccount = lazy(() => import("../pages/ReactivateAccount"));
const ReactivateConfirm = lazy(() => import("../pages/ReactivateConfirm"));

const AuthRoutes = [
  /* Guest-only routes — logged-in users are redirected to /home */
  <Route key="guest-routes" element={<GuestRoute />}>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Navigate to="/login" replace />} />
    <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
  </Route>,

  /* Routes accessible to everyone regardless of auth state */
  <Route key="reset" path="/reset-password" element={<Navigate to="/login" replace />} />,
  <Route key="reset-link" path="/reset-link-sent" element={<Navigate to="/login" replace />} />,
  <Route key="email-verification" path="/email-verification" element={<Navigate to="/login" replace />} />,
  <Route key="email-confirmed" path="/email-confirmed" element={<Navigate to="/login" replace />} />,
  <Route key="contact" path="/contact" element={<Contact />} />,
  <Route key="about" path="/about" element={<About />} />,
  <Route key="use-cases" path="/use-cases" element={<UseCases />} />,
  <Route key="privacy" path="/privacy" element={<Privacy />} />,
  <Route key="cookies" path="/cookies" element={<Cookies />} />,
  <Route key="terms" path="/terms" element={<Terms />} />,
  <Route
    key="google-callback"
    path="/google-auth/callback"
    element={<GoogleAuthRedirect />}
  />,
  <Route key="reactivate" path="/reactivate" element={<ReactivateAccount />} />,
  <Route key="reactivate-confirm" path="/reactivate-confirm" element={<ReactivateConfirm />} />,
];

export default AuthRoutes;
