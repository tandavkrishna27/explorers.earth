import { LogoFull, LogoIcon } from "../../../assets/icons/EoeLogo";
import { Share2 } from "lucide-react";
import "./PublicBranding.css";

export const publicHeaderClassName = "public-brand-header";
export const publicHeaderActionClassName = "public-brand-action";

export function PublicBrandIcon({ className = "" }: { className?: string }) {
  return <LogoIcon className={`public-brand-icon ${className}`.trim()} />;
}

export function PublicBrandWordmark({ className = "" }: { className?: string }) {
  return <LogoFull title="Explorers.Earth" className={`public-brand-wordmark ${className}`.trim()} />;
}

export function PublicHeaderShareIcon({ className = "" }: { className?: string }) {
  return (
    <Share2
      data-public-header-share-icon
      aria-hidden="true"
      width={20}
      height={20}
      className={className}
    />
  );
}
