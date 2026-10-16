import { Link } from "react-router-dom";
import type { ThemeSettings } from "../../Profile/types/themeTypes";
import PublicProfileFooter from "./PublicProfileFooter";
import { IMAGE_CONFIG } from "../../../config";
import Location from "../../../assets/icons/Location";
import { toast } from "sonner";
import { PublicBrandIcon, PublicHeaderShareIcon, publicHeaderActionClassName, publicHeaderClassName } from "./PublicBranding";
import { useOptionalPublicHeaderDescriptor } from "./PublicHeaderDescriptorContext";
import type { PublicHeaderShareDescriptor } from "./publicHeaderDescriptor";

type Account = Record<string, any>;

type PublicProfileFixedHeaderProps = {
  shareUrl?: string;
  profileName?: string;
  onTrackClick: (event: string, metadata: Record<string, string>) => void;
};

export function PublicProfileFixedHeader({ shareUrl, profileName, onTrackClick }: PublicProfileFixedHeaderProps) {
  const activeDescriptor = useOptionalPublicHeaderDescriptor();
  const descriptor: PublicHeaderShareDescriptor = activeDescriptor ?? {
    navigationKey: "legacy",
    title: `${profileName || "Explorer"}'s Profile`,
    text: "Check out this profile!",
    url: shareUrl || "",
    analyticsContext: "profile-header",
  };

  const share = async () => {
    try {
      if (descriptor.analyticsReady !== false) onTrackClick("share-button", {
        context: descriptor.analyticsContext,
        ...descriptor.analyticsMetadata,
      });
    } catch (error) {
      console.error("Failed to track share attempt:", error);
    }

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: descriptor.title,
          text: descriptor.text,
          url: descriptor.url,
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError") && (error as { name?: string } | null)?.name !== "AbortError") {
          console.error("Failed to share:", error);
        }
      }
      return;
    }

    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(descriptor.url);
      toast.success("Link copied!");
    } catch (error) {
      console.error("Failed to copy text:", error);
    }
  };
  return <header className={publicHeaderClassName}>
    <div className="public-brand-header-inner">
      <Link to="/" aria-label="Explorers.Earth home" className="public-brand-logo profile-presentation-focus inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl"><PublicBrandIcon /></Link>
      <button type="button" onClick={() => void share()} aria-label="Share" className={`${publicHeaderActionClassName} profile-presentation-focus flex min-h-11 min-w-11 items-center justify-center rounded-xl`}><PublicHeaderShareIcon /></button>
    </div>
  </header>;
}

export function PublicProfileHeroBackdrop({ account, theme }: { account?: Account; theme: ThemeSettings }) {
  if (theme.wallpaperMode !== "banner-top") return null;
  return <div data-profile-hero-backdrop className="pointer-events-none absolute inset-x-0 top-0 h-[380px] md:h-[420px] overflow-hidden z-0 rounded-b-[2rem] md:rounded-none"><img src={account?.bg_picture?.url || IMAGE_CONFIG.defaultImages.background} alt="Cover" className="w-full h-full object-cover object-[center_32%] scale-105" loading="eager" /><div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/55 to-black/90 z-0" /><div className="absolute inset-x-0 bottom-0 h-[70%] backdrop-blur-md bg-black/10 z-0" style={{ WebkitMaskImage: "linear-gradient(to top, black 30%, transparent 100%)", maskImage: "linear-gradient(to top, black 30%, transparent 100%)" }} /><div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/40 to-transparent z-0" /></div>;
}

export function PublicProfileWallpaper({ account, theme }: { account?: Account; theme: ThemeSettings }) {
  if (theme.wallpaperMode === "full-wallpaper-image") return <div data-profile-wallpaper className="fixed inset-0 z-0 overflow-hidden pointer-events-none"><img src={account?.bg_picture?.url || IMAGE_CONFIG.defaultImages.background} alt="Full Wallpaper" className="h-full w-full scale-105 object-cover opacity-25 blur-[3px]" /><div className="absolute inset-0 bg-black/65 backdrop-blur-sm" /></div>;
  if (theme.wallpaperMode === "ambient-gradient") return <div data-profile-wallpaper className="fixed inset-0 z-0 pointer-events-none opacity-15" style={{ background: "radial-gradient(circle at 50% 20%, var(--accent-color) 0%, transparent 60%), radial-gradient(circle at 80% 80%, var(--accent-color) 0%, transparent 50%)" }} />;
  return null;
}

export function PublicProfileIdentity({ account, interactive = false, onAvatarClick, primaryColor = "var(--text-primary)", secondaryColor = "var(--text-secondary)" }: { account?: Account; interactive?: boolean; onAvatarClick?: () => void; primaryColor?: string; secondaryColor?: string }) {
  const name = account?.Account_Name || account?.username || "Explorer";
  const avatar = account?.profile_picture?.url || IMAGE_CONFIG.defaultImages.profile;
  return <div data-profile-identity><button type="button" disabled={!interactive} onClick={onAvatarClick} aria-label={`View ${name}'s profile photo`} className="mx-auto block h-[7.5rem] w-[7.5rem] overflow-hidden rounded-full shadow-xl ring-1 ring-black/15"><img src={avatar} alt={`${name} profile photo`} className="h-full w-full object-cover" /></button><h1 className="mt-3 font-poppins text-base font-bold" style={{ color: primaryColor }}>{name}</h1>{account?.Primary_Address?.address && <div className="mt-1 flex items-center justify-center gap-1.5 text-xs" style={{ color: secondaryColor }}><Location className="h-3 w-3" fill="currentColor" /><span>{account.Primary_Address.address}</span></div>}</div>;
}

export function PublicProfileHero({ account, theme, interactive = false, onAvatarClick }: { account?: Account; theme: ThemeSettings; interactive?: boolean; onAvatarClick?: () => void }) {
  return <section data-profile-identity className="relative overflow-hidden pb-4 pt-16 text-center md:pt-32">
    <PublicProfileHeroBackdrop account={account} theme={theme} />
    <div className="relative z-10 px-4"><PublicProfileIdentity account={account} interactive={interactive} onAvatarClick={onAvatarClick} /></div>
  </section>;
}

export function PublicProfileBrandingFooter({ theme }: { theme: ThemeSettings }) {
  return <PublicProfileFooter brandingStyle={theme.footerBranding} />;
}
