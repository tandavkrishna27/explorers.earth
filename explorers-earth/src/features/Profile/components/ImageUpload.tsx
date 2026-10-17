import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import EditIcon from "../../../assets/icons/EditIcon";
import Cropper, { Area } from "react-easy-crop";
import getCroppedImg from "../../../utils/getCroppedImage";
import Modal from "../../../components/ui/Modal";
import Button from "../../../components/ui/Button";
import { toast } from "sonner";
import { IMAGE_CONFIG } from "../../../config";
import { ACCEPT_STRINGS, validateCanonicalImage } from "../../../hooks/useFileUpload";
import axios from "axios";

interface ImageUploadProps {
  onFileUpload?: (file: File) => void;
  cropType?: "profileCrop" | "backgroundCrop";
  onCropModalStateChange?: (isOpen: boolean) => void;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  onFileUpload,
  cropType,
  onCropModalStateChange,
}) => {
  const { t } = useTranslation();
  // local state for handling the selected Image
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  // local state for handling the Cropping Area
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  // local state for handling the Coordinated of Inital Crop
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  // local state for handling the default location of the zoom
  const [zoom, setZoom] = useState(1);
  // initalisng the useRef for triggering the input and to avoid the re-renders
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // handling the main crop modal
  const [showCropModal, setShowCropModal] = useState(false);
  // handling the options menu (choose from device or Instagram)
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  // handling the Instagram username modal
  const [showInstagramModal, setShowInstagramModal] = useState(false);
  const [instagramInput, setInstagramInput] = useState("");
  const [isLoadingInstagram, setIsLoadingInstagram] = useState(false);

  // fetching the ratios from config
  const { aspectRatios } = IMAGE_CONFIG;

  // handling the main button click - now shows options menu
  const handleButtonClick = () => {
    setShowOptionsMenu(true);
  };

  // handling device file selection
  const handleChooseFromDevice = () => {
    setShowOptionsMenu(false);
    fileInputRef.current?.click();
  };

  // handling Instagram import option
  const handleImportFromInstagram = () => {
    setShowOptionsMenu(false);
    setShowInstagramModal(true);
  };

  // handling file update / change
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // targetting the file
    const file = event.target.files?.[0];
    if (file) {
      const validationError = validateCanonicalImage(file);
      if (validationError) { toast.error(validationError); event.target.value = ""; return; }
      // Initalising the File Reader to handle the uploaded File
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
        // Open the modal when an image is selected
        setShowCropModal(true);
        onCropModalStateChange?.(true);
      };
      reader.readAsDataURL(file);
    }
  };

  // handling Instagram profile fetch
  const handleFetchInstagramProfile = async () => {
    if (!instagramInput.trim()) {
      toast.error("Please enter an Instagram username or profile link");
      return;
    }

    setIsLoadingInstagram(true);

    try {
      // Extract username from input (could be username or full URL)
      let username = instagramInput.trim();
      if (username.includes('instagram.com/')) {
        // Extract username from URL
        const urlMatch = username.match(/instagram\.com\/([^/?]+)/);
        if (urlMatch && urlMatch[1]) {
          username = urlMatch[1];
        }
      }

      // Call the Instagram API endpoint
      const response = await axios.get(`${import.meta.env.VITE_INSTAGRAM_API_URL || 'http://localhost:5000'}/api/instagram/profile`, {
        params: { username },
      });

      if (response.data.success && response.data.data) {
        const profileData = response.data.data;

        // Check if account is public
        if (!profileData.isPublic) {
          toast.error("This Instagram account is private. Only public accounts are supported.");
          setIsLoadingInstagram(false);
          return;
        }

        // Fetch the profile picture
        const profilePictureUrl = profileData.profilePicture;

        if (!profilePictureUrl) {
          toast.error("Profile picture not found");
          setIsLoadingInstagram(false);
          return;
        }

        // Convert the image URL to a data URL
        const imageResponse = await fetch(profilePictureUrl);
        const blob = await imageResponse.blob();
        const reader = new FileReader();
        reader.onload = () => {
          setSelectedImage(reader.result as string);
          setShowInstagramModal(false);
          setInstagramInput("");
          setShowCropModal(true);
          onCropModalStateChange?.(true);
          setIsLoadingInstagram(false);
          toast.success(`Successfully imported profile picture for @${profileData.username}`);
        };
        reader.readAsDataURL(blob);
      } else {
        toast.error("Failed to fetch Instagram profile");
        setIsLoadingInstagram(false);
      }
    } catch (error: any) {
      console.error("Error fetching Instagram profile:", error);
      const errorMessage = error.response?.data?.message || "Failed to fetch Instagram profile. Please make sure the account is public.";
      toast.error(errorMessage);
      setIsLoadingInstagram(false);
    }
  };

  // handling the cropping part
  const handleCropComplete = async () => {
    try {
      // edge case
      if (!selectedImage || !croppedArea) return;
      const croppedImage = await getCroppedImg(selectedImage, croppedArea);
      // Close the modal
      setShowCropModal(false);
      onCropModalStateChange?.(false);
      // Clear the selected image
      setSelectedImage(null);
      // Pass the cropped image to the parent component
      onFileUpload?.(croppedImage as File);
    } catch (error) {
      // notification for handling the error
      toast.error(t("toast.error.errorCroppingImage"));
      console.error("Error cropping image:", error);
    }
  };

  const handleCancel = () => {
    setShowCropModal(false);
    onCropModalStateChange?.(false);
    setSelectedImage(null);
  };

  const handleCancelInstagramModal = () => {
    setShowInstagramModal(false);
    setInstagramInput("");
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        className="bg-[hsl(var(--blue-cta))] p-2 rounded-full shadow-md hover:bg-[hsl(var(--blue-final))]"
        title={t('dashboard.profile.common.editImage')}
        type="button"
        onClick={handleButtonClick}
      >
        <EditIcon color="white" />
      </button>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept={ACCEPT_STRINGS.IMAGES_ONLY}
      />

      {/* Options Menu Modal */}
      <Modal type="default" onClose={() => setShowOptionsMenu(false)} isOpen={showOptionsMenu}>
        <div className="p-6 w-full max-w-md mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-[hsl(var(--text-primary))]">
            Choose Image Source
          </h2>
          <div className="flex flex-col gap-4">
            <button
              onClick={handleChooseFromDevice}
              className="w-full px-6 py-4 bg-[hsl(var(--blue-cta))] text-white rounded-xl hover:bg-[hsl(var(--blue-final))] transition-all duration-200 font-medium text-lg shadow-md hover:shadow-lg"
            >
              📁 Choose from Device
            </button>
            <button
              onClick={handleImportFromInstagram}
              className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-200 font-medium text-lg shadow-md hover:shadow-lg"
            >
              📸 Import Instagram Profile Photo
            </button>
          </div>
        </div>
      </Modal>

      {/* Instagram Username Modal */}
      <Modal type="default" onClose={handleCancelInstagramModal} isOpen={showInstagramModal}>
        <div className="p-6 w-full max-w-md mx-auto">
          <h2 className="text-2xl font-bold mb-4 text-[hsl(var(--text-primary))]">
            Import from Instagram
          </h2>
          <p className="text-sm text-[hsl(var(--text-secondary))] mb-6">
            Enter an Instagram username or profile link. Only public accounts are supported.
          </p>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2 text-[hsl(var(--text-primary))]">
              Username or Profile Link
            </label>
            <input
              type="text"
              value={instagramInput}
              onChange={(e) => setInstagramInput(e.target.value)}
              placeholder="username or https://instagram.com/username"
              className="w-full px-4 py-3 rounded-lg border border-[hsl(var(--border-primary))] bg-[hsl(var(--background-secondary))] text-[hsl(var(--text-primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--blue-cta))]"
              disabled={isLoadingInstagram}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFetchInstagramProfile();
                }
              }}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              btnText="Cancel"
              variant="redText"
              size="small"
              onClickHandler={handleCancelInstagramModal}
              disabled={isLoadingInstagram}
            />
            <Button
              btnText={isLoadingInstagram ? "Loading..." : "Import"}
              variant="primary"
              size="small"
              onClickHandler={handleFetchInstagramProfile}
              isLoading={isLoadingInstagram}
              disabled={isLoadingInstagram || !instagramInput.trim()}
            />
          </div>
        </div>
      </Modal>

      {/* Crop Modal */}
      <Modal type="crop" onClose={handleCancel} isOpen={showCropModal}>
        <div className="p-1 w-full rounded-xl h-full">
          {selectedImage && (
            <div className="relative w-full h-96 rounded-xl bg-gray-100">
              <Cropper
                image={selectedImage}
                crop={crop}
                zoom={zoom}
                aspect={
                  cropType === "profileCrop"
                    ? aspectRatios.profilePicture
                    : aspectRatios.backgroundPicture
                }
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, croppedAreaPixels) =>
                  setCroppedArea(croppedAreaPixels)
                }
              />
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              btnText="Cancel "
              variant="redText"
              size="small"
              onClickHandler={handleCancel}
            />
            <Button
              btnText={t('dashboard.profile.common.confirm')}
              variant="primary"
              size="small"
              onClickHandler={handleCropComplete}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ImageUpload;
