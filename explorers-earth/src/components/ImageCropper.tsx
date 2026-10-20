import { useState, useRef } from "react";
import EditIcon from "../assets/icons/EditIcon";
import Cropper, { Area } from "react-easy-crop";
import getCroppedImg from "../utils/getCroppedImage";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { IMAGE_CONFIG } from "../config";
import { ACCEPT_STRINGS } from "../hooks/useFileUpload";

interface ImageCropperProps {
  onFileUpload?: (file: File) => void;
  cropType: "profileCrop" | "backgroundCrop" | "guideCover";
  buttonTitle?: string;
  maxSizeMB?: number;
}

const ImageCropper: React.FC<ImageCropperProps> = ({
  onFileUpload,
  cropType,
  buttonTitle = "Edit Image",
  maxSizeMB = 10,
}) => {
  const { t } = useTranslation();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);

  const { aspectRatios } = IMAGE_CONFIG;

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`Image size must be less than ${maxSizeMB}MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);

    event.target.value = "";
  };

  const handleCropComplete = async () => {
    try {
      if (!selectedImage || !croppedArea) return;

      const croppedImage = await getCroppedImg(selectedImage, croppedArea);

      setShowCropModal(false);
      setSelectedImage(null);
      setZoom(1);
      setCrop({ x: 0, y: 0 });

      if (croppedImage) {
        onFileUpload?.(croppedImage as File);
        toast.success(t("imageCropper.success", "Image cropped successfully"));
      }
    } catch (error) {
      toast.error(t("imageCropper.error", "Error cropping the image"));
      console.error("Error cropping image:", error);
    }
  };

  const handleCancel = () => {
    setShowCropModal(false);
    setSelectedImage(null);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  };

  const getAspectRatio = () => {
    switch (cropType) {
      case "profileCrop":
        return aspectRatios.profilePicture;
      case "backgroundCrop":
        return aspectRatios.backgroundPicture;
      case "guideCover":
        return aspectRatios.guideCover;
      default:
        return 1;
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        className="bg-[hsl(var(--blue-cta))] p-2 rounded-full shadow-md hover:bg-[hsl(var(--blue-final))] transition-colors"
        title={buttonTitle}
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
                aspect={getAspectRatio()}
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
              btnText={t("common.cancel")}
              variant="redText"
              size="small"
              onClickHandler={handleCancel}
            />
            <Button
              btnText={t("common.confirm")}
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

export default ImageCropper;
