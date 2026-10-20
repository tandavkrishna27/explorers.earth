import { lazy, Suspense, type ReactNode } from "react";
import { Link } from "react-router-dom";
// three.js + react-globe.gl are ~1 MB; the decorative globe must not block the sign-in form.
const GlobeCanvas = lazy(() => import("./GlobeCanvas"));
import { LogoFull } from "../../assets/icons/EoeLogo";
import "./authShell.css";

/**
 * The "Earthrise" scene: warm-dark ground + rotating point-cloud globe + vignette,
 * a minimal top-left logo (→ landing page), and the centered card/form. Used by
 * both the OAuth-only screen (AuthLayout) and the manual username/password form.
 */
const AuthShell = ({ children }: { children: ReactNode }) => (
  <div className="ea-root">
    <Suspense fallback={null}><GlobeCanvas /></Suspense>
    <div className="ea-vignette" />

    <Link to="/" className="ea-header" aria-label="explorers.earth home">
      <LogoFull className="ea-headerlogo" />
    </Link>

    {children}
  </div>
);

export default AuthShell;
