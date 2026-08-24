import { memo } from "react";
import { Link } from "react-router-dom";

interface PublicProfileFooterProps {
  brandingStyle?: 'enabled' | 'minimal' | 'disabled';
  username?: string;
}

export const PublicProfileFooter = memo(({ brandingStyle = 'enabled' }: PublicProfileFooterProps) => {
  if (brandingStyle === 'disabled') return null;

  return (
    <footer className="relative z-10 mt-auto w-full border-t border-slate-200 bg-white px-4 pb-8 pt-10 text-center text-slate-900">
      <div className="inline-flex min-h-12 items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-2.5 shadow-sm">
        <span className="font-poppins text-sm font-medium text-slate-600">
          Powered by
        </span>
        <img src="/eoe-full.svg" alt="Explorers.Earth" className="h-7 w-auto sm:h-8" />
      </div>

      {brandingStyle === 'enabled' && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 font-poppins text-xs text-slate-600 sm:gap-4">
          <Link to="/" className="profile-presentation-focus rounded-md px-1 py-1 transition-colors hover:text-slate-950">Create your profile</Link>
          <span>•</span>
          <a href="mailto:support@explorers.earth" className="profile-presentation-focus rounded-md px-1 py-1 transition-colors hover:text-slate-950">Report</a>
          <span>•</span>
          <Link to="/privacy" className="profile-presentation-focus rounded-md px-1 py-1 transition-colors hover:text-slate-950">Privacy</Link>
        </div>
      )}
    </footer>
  );
});

PublicProfileFooter.displayName = "PublicProfileFooter";
export default PublicProfileFooter;
