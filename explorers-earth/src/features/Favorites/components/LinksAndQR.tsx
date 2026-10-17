import { FC, memo, useState } from "react";
import DownloadIcon from "../../../assets/icons/DownloadIcon";
import WhatsappIcon from "../../../assets/icons/WhatsappIcon";
import InstagramIcon from "../../../assets/icons/InstagramIcon";
import MobileIcon from "../../../assets/icons/MobileIcon";
import useAuthStore from "../../../store/store";
import { getCurrentDomain } from "../../../utils/getCurrentDomain";
import BoldLinkIcon from "../../../assets/icons/BoldLinkIcon";
import { useCityStore } from "../../../store/useCityStore";
import DeleteIcon from "../../../assets/icons/DeleteIcon";
import EditIcon from "../../../assets/icons/EditIcon";
import EyeOffIcon from "../../../assets/icons/EyeOffIcon";
import EyeOnIcon from "../../../assets/icons/EyeOnIcon";
import { useMenuItems } from "../hooks/useMenuItems";
import QRSticker from "./QRSticker";
import TwitterIcon from "../../../assets/icons/TwitterIcon";
import ShareModal from "../../../components/ShareModal";
import ShareIcon from "../../../assets/icons/ShareIcon";
import ThemedIcon from "../../../components/ui/ThemedIcon";
import { useQRActions } from "../../../hooks/useQRActions";
import { generateRecommendationQRUrl } from "../../../utils/qrCodeService";
import { createUtmParams } from "../../../utils/urlHelpers";

// type interface for Recommendations
interface Recommendation {
  title: string;
  image: string;
  rating: number;
  reviews: number;
}

// type interface for Selected city (Recommendation List)
export interface SelectedCity {
  documentId?: string;
  List_name?: string;
  slug?: string;
  Visibility?: boolean;
  recommendations?: Recommendation[] | undefined;
}

interface LinksAndQRProps {
  /** Any refresh the caller holds. Nothing here depends on an Apollo result shape. */
  refetchCities: () => Promise<unknown>;
  setShowConfirmDeleteModal: React.Dispatch<React.SetStateAction<boolean>>;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLocationModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleConfirmDeleteModal: () => void;
}
const LinksAndQR: FC<LinksAndQRProps> = memo(
  ({
    refetchCities,
    setShowConfirmDeleteModal,
    setIsEditing,
    handleConfirmDeleteModal,
    setIsLocationModalOpen,
  }) => {
    const [showShareModal, setShowShareModal] = useState<boolean>(false);
    const { selectedCity } = useCityStore();
    // user object from the state
    const { user } = useAuthStore();

    // Create UTM parameters for QR code sharing
    const qrUtmParams = createUtmParams.qrCode();

    // Use centralized QR actions hook with recommendation context
    // LinksAndQR is used in Favorites page for specific recommendation lists
    // QR should redirect to: host/{username}/places/{recommendationListName}
    const { qrRef, handleDownloadQR, handleCopyLink } = useQRActions({
      username: user?.username,
      context: "recommendation",
      recommendationListName: selectedCity?.slug, // This should be the recommendation list name
      utmParams: qrUtmParams, // Include UTM parameters for tracking
    });

    // custom hook for handling the carousel menu logic
    const { handleRecommendationListVisibility, isPublished } = useMenuItems({
      refetchCities,
      setShowConfirmDeleteModal,
    });

    const handleEditRecommendedList = () => {
      setIsEditing(true);
      setIsLocationModalOpen(true);
    };
    const shareButtons = [
      {
        name: "Instagram",
        icon: <InstagramIcon color="white" />,
        url: `https://www.instagram.com/`,
      },
      {
        name: "Twitter",
        icon: <TwitterIcon color="white" />,
        url: `https://twitter.com/`,
      },
      {
        name: "WhatsApp",
        icon: <WhatsappIcon fill="white" />,
        url: `https://www.whatsapp.com/`,
      },
      {
        name: "Mobile",
        icon: (
          <ThemedIcon variant="primary">
            <MobileIcon />
          </ThemedIcon>
        ),
        url: `www.gmail.com`,
      },
    ];

    const url = getCurrentDomain();

    // Generate QR URL for recommendation: host/{username}/places/{recommendationListName}
    const qrCodeUrl =
      user?.username && selectedCity?.slug
        ? generateRecommendationQRUrl(user.username, selectedCity.slug, qrUtmParams)
        : `${url}/${user?.username}`;

    const [manageOpen, setManageOpen] = useState<boolean>(true);
    const [qrOpen, setQrOpen] = useState<boolean>(true);

    return (
      <div className="mb-0 md:mt-4 max-w-[600px] mx-auto w-full">
        <div className="bg-black/15 rounded-2xl p-4 md:p-6 space-y-4 border border-dashboard-border">
          {/* Manage Accordion */}
          <div className="acc-item border border-dashboard-border bg-white/[0.02] rounded-xl overflow-hidden">
            <button
              onClick={() => setManageOpen(!manageOpen)}
              className="w-full bg-none border-none py-3 px-4 text-white text-xs font-bold font-poppins flex justify-between items-center cursor-pointer hover:bg-white/[0.04]"
            >
              <span>Manage</span>
              <svg
                className={`transform transition-transform duration-200 ${manageOpen ? "rotate-180" : ""}`}
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {manageOpen && (
              <div className="border-t border-dashboard-border bg-black/10 p-4 flex flex-col gap-3">
                {/* Delete button */}
                <button
                  onClick={handleConfirmDeleteModal}
                  className="w-full bg-transparent border border-white/20 hover:border-white/40 hover:bg-white/5 text-white rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <DeleteIcon stroke="currentColor" />
                  <span>Delete</span>
                </button>

                {/* Edit button */}
                <button
                  onClick={handleEditRecommendedList}
                  className="w-full bg-transparent border border-white/20 hover:border-white/40 hover:bg-white/5 text-white rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <EditIcon color="currentColor" />
                  <span>Edit</span>
                </button>

                {/* Published/Draft button toggle */}
                <button
                  onClick={handleRecommendationListVisibility}
                  className={`w-full bg-transparent border rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    isPublished
                      ? "border-[#10B981] hover:bg-[#10B981]/5 text-[#10B981] hover:border-[#34d399] hover:text-[#34d399]"
                      : "border-[#f87171] hover:bg-[#f87171]/5 text-[#f87171] hover:border-[#f87171] hover:text-[#f87171]"
                  }`}
                >
                  {isPublished ? (
                    <>
                      <EyeOnIcon stroke="currentColor" size="4" />
                      <span>Published</span>
                    </>
                  ) : (
                    <>
                      <EyeOffIcon stroke="currentColor" size="4" />
                      <span>Draft</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* QR Accordion */}
          <div
            className="acc-item border bg-white/[0.02] rounded-xl overflow-hidden transition-colors"
            style={{ borderColor: "var(--dash-accent)" }}
          >
            <button
              onClick={() => setQrOpen(!qrOpen)}
              className="w-full bg-none border-none py-3 px-4 text-white text-xs font-bold font-poppins flex justify-between items-center cursor-pointer hover:bg-white/[0.04]"
            >
              <span>My QR</span>
              <svg
                className={`transform transition-transform duration-200 ${qrOpen ? "rotate-180" : ""}`}
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {qrOpen && (
              <div className="border-t border-dashboard-border bg-black/10 p-4">
                <div className={`relative ${!isPublished && "blur-sm opacity-60 pointer-events-none"}`}>
                  <div className="flex justify-center items-center my-4">
                    <QRSticker qrRef={qrRef} qrCodeUrl={qrCodeUrl} />
                  </div>

                  <div className="flex justify-around items-center w-full mt-6 py-2 border-t border-white/5">
                    {/* Share Link */}
                    <div
                      onClick={() => setShowShareModal(true)}
                      className="flex flex-col items-center gap-1.5 cursor-pointer text-white/80 hover:text-white transition-colors"
                      data-walkthrough="share-button"
                    >
                      <ShareIcon color="currentColor" />
                      <span className="font-poppins text-[10px] font-semibold">Share Link</span>
                    </div>

                    {/* Copy Link */}
                    <div
                      onClick={handleCopyLink}
                      className="flex flex-col items-center gap-1.5 cursor-pointer text-white/80 hover:text-white transition-colors"
                    >
                      <BoldLinkIcon color="currentColor" />
                      <span className="font-poppins text-[10px] font-semibold">Copy Link</span>
                    </div>

                    {/* Download QR */}
                    <div
                      onClick={handleDownloadQR}
                      className="flex flex-col items-center gap-1.5 cursor-pointer text-white/80 hover:text-white transition-colors"
                    >
                      <DownloadIcon />
                      <span className="font-poppins text-[10px] font-semibold">Download QR</span>
                    </div>
                  </div>
                </div>

                <ShareModal
                  shareButtons={shareButtons}
                  isOpen={showShareModal}
                  onClose={() => setShowShareModal(false)}
                  url={qrCodeUrl}
                  utmParams={qrUtmParams}
                  backgroundImage={selectedCity?.List_Name_Details?.thumbnail}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

export default LinksAndQR;
