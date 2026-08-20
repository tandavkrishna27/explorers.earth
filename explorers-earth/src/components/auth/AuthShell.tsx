import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import GlobeCanvas from "./GlobeCanvas";
import { LogoFull } from "../../assets/icons/EoeLogo";
import "./authShell.css";

/**
 * The "Earthrise" scene: warm-dark ground + rotating point-cloud globe + vignette,
 * a minimal top-left logo (→ landing page), and the centered card/form. Used by
 * both the OAuth-only screen (AuthLayout) and the manual username/password form.
 */
const AuthShell = ({ children }: { children: ReactNode }) => (
  <div className="ea-root">
    <GlobeCanvas />
    <div className="ea-vignette" />

    <Link to="/" className="ea-header" aria-label="explorers.earth home">
      <LogoFull className="ea-headerlogo" />
    </Link>

    {children}
  </div>
);

export default AuthShell;
