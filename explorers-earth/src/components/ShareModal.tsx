import React, { ReactNode, useState } from "react";
import { usePublicCategoryThemeStyles } from "../features/PublicHome/components/PublicCategoryThemeContext";
import { useTranslation } from "react-i18next";
import CopyIcon from "../assets/icons/CopyIcon";
import CopiedIcon from "../assets/icons/CopiedIcon";
import DownloadIcon from "../assets/icons/DownloadIcon";
import Modal from "./ui/Modal";
import QRCode from "./ui/QRCode";
import { useCityStore } from "../store/useCityStore";
import { toast } from "sonner";
import { appendUtmParams, UTMParameters, createUtmParams } from "../utils/urlHelpers";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  shareButtons: {
    name?: string;
    color?: string;
    url?: string;
    icon?: ReactNode;
  }[];
  utmParams?: UTMParameters; // Optional UTM parameters for tracking
  backgroundImage?: string; // Optional background image for QR sticker
  hideQRTab?: boolean; // Optional flag to hide QR tab
}

const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  url,
  shareButtons,
  utmParams,
  backgroundImage,
  hideQRTab = false,
}) => {
  const categoryStyles = usePublicCategoryThemeStyles();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'share' | 'qr'>('share');
  const { selectedCity } = useCityStore();

  if (!isOpen) return null;

  // Apply UTM parameters to the URL if provided
  const finalUrl = utmParams ? appendUtmParams(url, utmParams) : url;

  // Create platform-specific UTM parameters for social media sharing
  const createSocialMediaUrl = (platform: string) => {
    const socialUtmParams = createUtmParams.socialMedia(platform);
    return appendUtmParams(url, socialUtmParams);
  };


  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(finalUrl);
      toast.success(t("dashboard.shareModal.linkCopiedToast"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy text: ", error);
    }
  };

  const handleShareClick = (shareUrl: string, platform?: string, socialMediaUrl?: string) => {
    try {
      if (platform === "Instagram" && socialMediaUrl) {
        // For Instagram, copy the URL with UTM parameters to clipboard
        navigator.clipboard.writeText(socialMediaUrl);
        toast.success(t("toast.success.instagramLinkCopied"));
      } else {
        window.open(shareUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      console.error("Failed to share: ", error);
    }
  };

  const handleDownloadQR = async () => {
    try {
      // Use the same approach as QRSticker - html-to-image library
      const { toPng } = await import('html-to-image');
      const qrContainer = document.getElementById('qr-sticker-container');

      if (qrContainer) {
        // Wait a bit for any images to load
        await new Promise(resolve => setTimeout(resolve, 300));

        const dataUrl = await toPng(qrContainer, {
          cacheBust: true,
          backgroundColor: '#000000',
          pixelRatio: 3, // Higher resolution
          quality: 1.0,
          style: {
            transform: 'scale(1)',
            transformOrigin: 'top left'
          }
        });

        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'explorers-qr-sticker.png';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Failed to download QR sticker:', error);

      // Fallback to html2canvas
      try {
        const { default: html2canvas } = await import('html2canvas');
        const qrContainer = document.getElementById('qr-sticker-container');

        if (qrContainer) {
          await new Promise(resolve => setTimeout(resolve, 300));

          const canvas = await html2canvas(qrContainer, {
            backgroundColor: '#000000',
            scale: 3,
            useCORS: true,
            allowTaint: true,
            logging: false
          });

          const link = document.createElement('a');
          link.download = 'explorers-qr-sticker.png';
          link.href = canvas.toDataURL('image/png', 1.0);
          link.click();
        }
      } catch (fallbackError) {
        console.error('Fallback download also failed:', fallbackError);
      }
    }
  };

  // Create social media sharing template with UTM parameters
  const createSocialMediaTemplate = (platform: string) => {
    const socialMediaUrl = createSocialMediaUrl(platform);
    return `I just found an awesome spot and had to share it with you! 🌍✨ Visit ${socialMediaUrl} to check it out! 🚀📍 Use explorers to create and share your own recommendations.`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div
        className={categoryStyles ? "w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto [&_button:focus-visible]:!outline [&_button:focus-visible]:!outline-2 [&_button:focus-visible]:!outline-offset-2 [&_button:focus-visible]:!outline-[var(--category-focus)] [&_button:focus-visible]:!transform-none" : "w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto"}
        style={{
          boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.15), inset 0 0 40px rgba(0, 0, 0, 0.1)'
        }}
      >
        <div className="p-4 sm:p-6">
          {/* Tab Navigation */}
          {!hideQRTab && (
            <div className="flex mb-6 bg-dashboard-sidebar rounded-lg p-1">
              <button
                onClick={() => setActiveTab('share')}
                className={`flex-1 py-3 px-6 sm:px-8 md:px-10 lg:px-12 rounded-md text-sm sm:text-base font-semibold transition-all duration-200 ${activeTab === 'share'
                  ? 'bg-dashboard-accent text-dashboard shadow-dashboard-elevated'
                  : 'text-dashboard-light hover:text-dashboard hover:bg-dashboard-muted'
                  }`}
                style={{
                  color: categoryStyles ? (activeTab === 'share' ? 'var(--category-accent-ink)' : 'var(--category-muted)') : activeTab === 'share' ? '#ffffff' : '#d1d5db',
                  backgroundColor: activeTab === 'share' ? (categoryStyles ? 'var(--category-accent)' : 'var(--dash-accent)') : 'transparent'
                }}
              >
                Share
              </button>
              <button
                onClick={() => setActiveTab('qr')}
                className={`flex-1 py-3 px-6 sm:px-8 md:px-10 lg:px-12 rounded-md text-sm sm:text-base font-semibold transition-all duration-200 ${activeTab === 'qr'
                  ? 'bg-[hsl(var(--blue-cta))] text-white shadow-md'
                  : 'text-[hsl(var(--text-light))] hover:text-white hover:bg-[hsl(var(--charcoal))]'
                  }`}
                style={{
                  color: categoryStyles ? (activeTab === 'qr' ? 'var(--category-accent-ink)' : 'var(--category-muted)') : activeTab === 'qr' ? '#ffffff' : '#d1d5db',
                  backgroundColor: activeTab === 'qr' ? (categoryStyles ? 'var(--category-accent)' : 'hsl(var(--blue-cta))') : 'transparent'
                }}
              >
                QR
              </button>
            </div>
          )}

          {/* Share Tab Content */}
          {(activeTab === 'share' || hideQRTab) && (
            <>
              {/* URL Copy Section */}
              <div className="mb-8">
                <div data-category-share-link={categoryStyles ? true : undefined} style={categoryStyles ? { backgroundImage: 'none', backgroundColor: 'var(--category-card)', borderColor: 'var(--category-control-border)' } : undefined} className="flex items-center gap-3 p-4 bg-gradient-to-r from-[hsl(var(--charcoal))] to-[hsl(var(--deep-charcoal))] rounded-xl border border-[hsl(var(--border))] shadow-lg">
                  <div className="flex-1 min-w-0">
                    <label style={categoryStyles ? { color: 'var(--category-muted)' } : undefined} className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1 uppercase tracking-wide">
                      Share Link
                    </label>
                    <input
                      type="text"
                      value={finalUrl}
                      readOnly
                      style={categoryStyles ? { color: 'var(--category-text)' } : undefined}
                      className="w-full text-sm text-[hsl(var(--text-light))] bg-transparent border-none outline-none truncate font-mono"
                    />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyLink();
                    }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 transform hover:scale-105 ${copied
                      ? "bg-dashboard-accent text-dashboard shadow-dashboard-elevated"
                      : "bg-gradient-to-r from-[hsl(var(--blue-cta))] to-[hsl(var(--blue-final))] text-white hover:from-[hsl(var(--blue-final))] hover:to-[hsl(var(--blue-final))] shadow-lg hover:shadow-xl"
                      }`}
                    style={{
                      backgroundColor: categoryStyles ? 'var(--category-accent)' : copied ? '#10b981' : undefined,
                      backgroundImage: categoryStyles ? 'none' : undefined,
                      color: categoryStyles ? 'var(--category-accent-ink)' : '#ffffff',
                      visibility: 'visible',
                      opacity: 1
                    }}
                  >
                    <div style={{ color: categoryStyles ? 'var(--category-accent-ink)' : '#ffffff', visibility: 'visible', opacity: 1 }}>
                      {copied ? <CopiedIcon /> : <CopyIcon />}
                    </div>
                    <span style={{ color: categoryStyles ? 'var(--category-accent-ink)' : '#ffffff', visibility: 'visible', opacity: 1 }}>
                      {copied ? "Copied!" : "Copy"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Social Media Buttons */}
              <div className="mb-4">
                <h3 style={categoryStyles ? { color: 'var(--category-muted)' } : undefined} className="text-sm font-medium text-gray-400 mb-4 text-center uppercase tracking-wide">
                  Share on Social Media
                </h3>
                <div className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-6 lg:gap-8 xl:gap-10">
                  {shareButtons.slice(0, 3).map((button) => {
                    let shareUrl = "";
                    let socialMediaUrl = "";

                    switch (button.name) {
                      case "WhatsApp": {
                        socialMediaUrl = createSocialMediaUrl("whatsapp");
                        const whatsappTemplate = createSocialMediaTemplate("whatsapp");
                        shareUrl = `https://wa.me/?text=${encodeURIComponent(whatsappTemplate)}`;
                        break;
                      }
                      case "Twitter": {
                        socialMediaUrl = createSocialMediaUrl("twitter");
                        const twitterTemplate = createSocialMediaTemplate("twitter");
                        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterTemplate)}`;
                        break;
                      }
                      case "Instagram":
                        socialMediaUrl = createSocialMediaUrl("instagram");
                        shareUrl = `https://www.instagram.com/`;
                        break;
                      case "SMS": {
                        socialMediaUrl = createSocialMediaUrl("sms");
                        const smsTemplate = createSocialMediaTemplate("sms");
                        shareUrl = `sms:?body=${encodeURIComponent(smsTemplate)}`;
                        break;
                      }
                      default:
                        break;
                    }
                    return (
                      <button
                        key={button.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShareClick(shareUrl, button.name, socialMediaUrl);
                        }}
                        className="flex flex-col items-center justify-center p-5 sm:p-6 md:p-7 lg:p-8 xl:p-10 transition-all duration-200 hover:scale-110 text-white rounded-xl hover:bg-gray-800/50 backdrop-blur-sm"
                        style={{
                          backgroundColor: 'transparent',
                          color: '#ffffff',
                          visibility: 'visible',
                          opacity: 1,
                          border: 'none'
                        }}
                      >
                        <div
                          className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 lg:w-12 lg:h-12 xl:w-14 xl:h-14 text-white transition-transform duration-200 hover:scale-110"
                          style={{
                            color: '#ffffff',
                            visibility: 'visible',
                            opacity: 1
                          }}
                        >
                          {button.icon}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* QR Tab Content */}
          {!hideQRTab && activeTab === 'qr' && (
            <>
              {/* QR Code Card - Exact same design as QRSticker */}
              <div className="mb-6 flex justify-center">
                <div
                  className="flex relative flex-col justify-between items-center h-[16rem] p-6 bg-black border-2 text-white rounded-lg"
                  id="qr-sticker-container"
                >
                  {/* Background Image - Same as QRSticker */}
                  <div
                    className="absolute bottom-0 left-0 w-full h-1/2 rounded-b-lg bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${backgroundImage || selectedCity?.List_Name_Details?.thumbnail || 'https://images.unsplash.com/photo-1506905925346-14b1e3d7e6b9?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80'})`
                    }}
                  />

                  {/* Title - Same as QRSticker */}
                  <p className="text-sm mb-2">My Recommendations</p>

                  {/* QR Code and Badge - Same layout as QRSticker */}
                  <div className="z-10 items-center flex flex-col">
                    {/* QR Code - Same styling as QRSticker */}
                    <div className="p-2 bg-white rounded-lg shadow-md">
                      <QRCode
                        value={finalUrl}
                        size="medium"
                        className="qr-code-canvas"
                        style={{ height: "100px", width: "100px" }}
                      />
                    </div>

                    {/* Travel Badge - Same styling as QRSticker */}
                    <p className="bg-gray-200 text-black mt-2 px-4 py-1 font-poppins rounded-full text-xs">
                      Travel like a local
                    </p>
                  </div>
                </div>
              </div>

              {/* Download and Share Options */}
              <div className="mb-4">
                <h3 style={categoryStyles ? { color: 'var(--category-muted)' } : undefined} className="text-sm font-medium text-gray-400 mb-4 text-center uppercase tracking-wide">
                  Share & Download
                </h3>
                <div className="grid grid-cols-4 gap-2 sm:gap-3 md:gap-4 lg:gap-6 xl:gap-8">
                  {shareButtons.slice(0, 3).map((button) => {
                    let shareUrl = "";
                    let socialMediaUrl = "";

                    switch (button.name) {
                      case "WhatsApp": {
                        socialMediaUrl = createSocialMediaUrl("whatsapp");
                        const whatsappTemplate = createSocialMediaTemplate("whatsapp");
                        shareUrl = `https://wa.me/?text=${encodeURIComponent(whatsappTemplate)}`;
                        break;
                      }
                      case "Twitter": {
                        socialMediaUrl = createSocialMediaUrl("twitter");
                        const twitterTemplate = createSocialMediaTemplate("twitter");
                        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterTemplate)}`;
                        break;
                      }
                      case "Instagram":
                        socialMediaUrl = createSocialMediaUrl("instagram");
                        shareUrl = `https://www.instagram.com/`;
                        break;
                      case "SMS": {
                        socialMediaUrl = createSocialMediaUrl("sms");
                        const smsTemplate = createSocialMediaTemplate("sms");
                        shareUrl = `sms:?body=${encodeURIComponent(smsTemplate)}`;
                        break;
                      }
                      default:
                        break;
                    }
                    return (
                      <button
                        key={button.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShareClick(shareUrl, button.name, socialMediaUrl);
                        }}
                        className="flex flex-col items-center justify-center p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 transition-all duration-200 hover:scale-110 text-white rounded-lg hover:bg-gray-800/50 backdrop-blur-sm"
                        style={{
                          backgroundColor: 'transparent',
                          color: '#ffffff',
                          visibility: 'visible',
                          opacity: 1,
                          border: 'none'
                        }}
                      >
                        <div
                          className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 xl:w-12 xl:h-12 text-white transition-transform duration-200 hover:scale-110"
                          style={{
                            color: '#ffffff !important',
                            visibility: 'visible',
                            opacity: 1,
                            fill: '#ffffff',
                            stroke: '#ffffff'
                          }}
                        >
                          {button.icon}
                        </div>
                      </button>
                    );
                  })}

                  {/* Download Button */}
                  <button
                    onClick={handleDownloadQR}
                    className="flex flex-col items-center justify-center p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8 transition-all duration-200 hover:scale-110 text-white rounded-lg hover:bg-gray-800/50 backdrop-blur-sm"
                    style={{
                      backgroundColor: 'transparent',
                      color: '#ffffff',
                      visibility: 'visible',
                      opacity: 1,
                      border: 'none'
                    }}
                  >
                    <div className={`w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 xl:w-12 xl:h-12 transition-transform duration-200 hover:scale-110 ${categoryStyles ? "text-[var(--category-text)] [&_svg]:stroke-current" : ""}`}>
                      <DownloadIcon />
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ShareModal;
