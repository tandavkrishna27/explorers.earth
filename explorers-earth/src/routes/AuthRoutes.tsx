import { Navigate, Route } from "react-router-dom";
import Login from "../pages/Login";
import GoogleAuthRedirect from "../pages/GoogleAuthRedirect";
import PublicMusic from "../pages/public/PublicMusic";
import Landing from "../pages/Landing";
import Contact from "../pages/Contact";
import About from "../pages/About";
import UseCases from "../pages/UseCases";
import Privacy from "../pages/Privacy";
import Cookies from "../pages/Cookies";
import Terms from "../pages/Terms";
import ReactivateAccount from "../pages/ReactivateAccount";
import ReactivateConfirm from "../pages/ReactivateConfirm";
import GuestRoute from "../components/GuestRoute";

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
  <Route key="public-music" path="/music/share/:publicSlug" element={<PublicMusic />} />,
  <Route key="reactivate" path="/reactivate" element={<ReactivateAccount />} />,
  <Route key="reactivate-confirm" path="/reactivate-confirm" element={<ReactivateConfirm />} />,
];

export default AuthRoutes;
