import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import AuthShell from "./AuthShell";

interface Helper {
  label: string;
  to: string;
}

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  googleLabel: string;
  onGoogle: () => void;
  termsPrefix: string;
  termsLabel: string;
  privacyLabel: string;
  andWord: string;
  switchPrompt: string;
  switchCta: string;
  switchTo: string;
  secureLabel: string;
  helpers?: Helper[];
  banner?: ReactNode;
}

const GoogleG = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.9 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8C43.9 37.9 46.5 31.8 46.5 24.5z" />
    <path fill="#FBBC05" d="M10.4 28.3c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.9-6.1C.9 15.9 0 19.8 0 24s.9 8.1 2.5 11.4l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.6l-7.5-5.8c-2 1.4-4.7 2.3-7.8 2.3-6.4 0-11.7-3.7-13.6-8.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

const AuthLayout = ({
  eyebrow, title, subtitle, googleLabel, onGoogle,
  termsPrefix, termsLabel, privacyLabel, andWord,
  switchPrompt, switchCta, switchTo, secureLabel, helpers, banner,
}: AuthLayoutProps) => (
  <AuthShell>
    <main className="ea-card">
      <div className="ea-eyebrow"><span className="ea-spark" />{eyebrow}</div>

      {banner}

      <h1 className="ea-title">{title}</h1>
      <p className="ea-sub">{subtitle}</p>

      <button className="ea-gbtn" type="button" onClick={onGoogle}>
        <GoogleG />
        <span>{googleLabel}</span>
      </button>

      <p className="ea-terms">
        {termsPrefix} <a href="/terms">{termsLabel}</a> {andWord}{" "}
        <a href="/privacy">{privacyLabel}</a>.
      </p>

      <div className="ea-divide">{secureLabel}</div>

      <p className="ea-switch">
        {switchPrompt}
        <Link to={switchTo}>{switchCta}</Link>
      </p>

      {helpers && helpers.length > 0 && (
        <div className="ea-helpers">
          {helpers.map((h) => (
            <Link key={h.to} to={h.to}>{h.label}</Link>
          ))}
        </div>
      )}
    </main>
  </AuthShell>
);

export default AuthLayout;
