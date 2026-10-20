import { useRef } from "react";
import { MIN_QR_DOWNLOAD_SIZE } from "../utils/qrDownload";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { getCurrentDomain } from "../utils/getCurrentDomain";
import { QR_CONSTANTS } from "../config/qrConfig";
import {
  generateUserProfileQRUrl,
  generateUserPlacesQRUrl,
  generateRecommendationQRUrl,
} from "../utils/qrCodeService";
import { UTMParameters, appendUtmParams } from "../utils/urlHelpers";
import { useTranslation } from "react-i18next";

interface UseQRActionsProps {
  username?: string;
  citySlug?: string;
  customUrl?: string;
  // New context-based props for better URL generation
  context?: "profile" | "places" | "recommendation";
  recommendationListName?: string;
  // UTM parameters for tracking
  utmParams?: UTMParameters;
}

export const useQRActions = ({
  username,
  citySlug,
  customUrl,
  context,
  recommendationListName,
  utmParams,
}: UseQRActionsProps = {}) => {
  const { t } = useTranslation();
  const qrRef = useRef<HTMLDivElement | null>(null);

  const getQRUrl = () => {
    // If custom URL is provided, use it directly
    if (customUrl) return customUrl;

    // If username is not available, fallback to current domain
    if (!username) return getCurrentDomain();

    // Context-based URL generation with clear redirect logic
    switch (context) {
      case "profile":
        // PublicProfile page: Redirect to host/{username}
        return generateUserProfileQRUrl(username, utmParams);

      case "places":
        // PublicHome page: Redirect to host/{username}/places
        return generateUserPlacesQRUrl(username, undefined, utmParams);

      case "recommendation":
        // Recommendation page: Redirect to host/{username}/places/{recommendationListName}
        if (recommendationListName) {
          return generateRecommendationQRUrl(username, recommendationListName, utmParams);
        }
        // Fallback to places if no recommendation list name
        return generateUserPlacesQRUrl(username, undefined, utmParams);

      default:
        // Legacy fallback for backward compatibility
        if (citySlug) {
          const baseUrl = `${getCurrentDomain()}/${username}/places/${citySlug}`;
          return utmParams ? appendUtmParams(baseUrl, utmParams) : baseUrl;
        }
        return generateUserProfileQRUrl(username, utmParams);
    }
  };

  const handleDownloadQR = async () => {
    if (!qrRef.current) {
      toast.error(t("dashboard.recommendations.toastMessages.qrNotReady"));
      return;
    }

    try {
      // Render at least MIN_QR_DOWNLOAD_SIZE square however small the card is on screen.
      const width = qrRef.current.offsetWidth || MIN_QR_DOWNLOAD_SIZE;
      const dataUrl = await toPng(qrRef.current, {
        cacheBust: true,
        pixelRatio: Math.max(window.devicePixelRatio || 1, Math.ceil(MIN_QR_DOWNLOAD_SIZE / width)),
      });

      const link = document.createElement("a");
      link.href = dataUrl;

      // Generate filename using config
      const filename =
        username && citySlug
          ? QR_CONSTANTS.FILENAME_PATTERN.PROFILE(username, citySlug)
          : QR_CONSTANTS.FILENAME_PATTERN.GENERIC;

      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(
        t("dashboard.recommendations.toastMessages.qrDownloadSuccess")
      );
    } catch (error) {
      console.error("Error generating QR code image:", error);
      toast.error(t("dashboard.recommendations.toastMessages.qrDownloadError"));
    }
  };

  const handleCopyLink = async () => {
    const url = getQRUrl();

    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("dashboard.recommendations.toastMessages.linkCopied"));
    } catch (error) {
      console.error("Failed to copy text:", error);
      toast.error(t("dashboard.recommendations.toastMessages.linkCopyError"));
    }
  };

  const handleShare = async () => {
    const url = getQRUrl();

    if (navigator.share) {
      try {
        await navigator.share({
          title: QR_CONSTANTS.SHARE_TEMPLATES.PROFILE.title,
          text: QR_CONSTANTS.SHARE_TEMPLATES.PROFILE.text,
          url: url,
        });
      } catch (error) {
        console.error("Error sharing:", error);
        // Fallback to copy
        handleCopyLink();
      }
    } else {
      // Fallback to copy for browsers without Web Share API
      handleCopyLink();
    }
  };

  return {
    qrRef,
    qrUrl: getQRUrl(),
    handleDownloadQR,
    handleCopyLink,
    handleShare,
  };
};
