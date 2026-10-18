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

  // fetching the ratios from config
  const { aspectRatios } = IMAGE_CONFIG;

  // handling the main button click - opens the device file picker
  const handleButtonClick = () => {
    fileInputRef.current?.click();
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
