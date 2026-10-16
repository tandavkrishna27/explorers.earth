import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { 
  validateFiles, 
  validateFile,
  FileValidationOptions, 
  ACCEPT_STRINGS,
  getSupportedFormatsText 
} from '../utils/fileValidation';

// Re-export for convenience
export { ACCEPT_STRINGS } from '../utils/fileValidation';

interface UseFileUploadOptions extends FileValidationOptions {
  canonicalPurpose?: "profile" | "background" | "feed" | "recommendation";
  onValidFiles?: (files: File[]) => void;
  onInvalidFiles?: (invalidFiles: { file: File; error: string }[]) => void;
  showToastOnError?: boolean;
  showToastOnSuccess?: boolean;
}

interface UseFileUploadReturn {
  handleFileSelection: (files: FileList | File[]) => void;
  isValidating: boolean;
  acceptString: string;
  supportedFormatsText: string;
}

/**
 * Custom hook for file upload validation and handling
 */
export const useFileUpload = (options: UseFileUploadOptions = {}): UseFileUploadReturn => {
  const { t } = useTranslation();
  const {
    allowImages = true,
    allowVideos = true,
    maxImageSize,
    maxVideoSize,
    customErrorMessages,
    onValidFiles,
    onInvalidFiles,
    showToastOnError = true,
    showToastOnSuccess = true,
    canonicalPurpose,
  } = options;

  const [isValidating, setIsValidating] = useState(false);

  // Generate accept string for file input
  const acceptString = (() => {
    if (canonicalPurpose === "profile" || canonicalPurpose === "background") return ACCEPT_STRINGS.IMAGES_ONLY;
    if (canonicalPurpose === "feed") return `${ACCEPT_STRINGS.IMAGES_ONLY},video/mp4`;
    if (allowImages && allowVideos) return ACCEPT_STRINGS.IMAGES_AND_VIDEOS;
    if (allowImages) return ACCEPT_STRINGS.IMAGES_ONLY;
    if (allowVideos) return ACCEPT_STRINGS.VIDEOS_ONLY;
    return '';
  })();

  // Generate supported formats text
  const supportedFormatsText = getSupportedFormatsText(allowImages, allowVideos);

  const handleFileSelection = useCallback(
    async (files: FileList | File[]) => {
      if (!files || files.length === 0) return;

      setIsValidating(true);

      try {
        const { validFiles: selectedFiles, invalidFiles } = validateFiles(files, {
          allowImages: canonicalPurpose ? true : allowImages,
          allowVideos: canonicalPurpose === "feed" || (!canonicalPurpose && allowVideos),
          maxImageSize,
          maxVideoSize,
          customErrorMessages,
        });
        const validFiles = selectedFiles.filter((file) => {
          if (!canonicalPurpose || file.type !== "video/webm" && file.type !== "video/quicktime") return true;
          invalidFiles.push({ file, error: "Only MP4 video is supported for profile media" });
          return false;
        });

        // Handle invalid files
        if (invalidFiles.length > 0) {
          if (showToastOnError) {
            invalidFiles.forEach(({ file, error }) => {
              toast.error(t("toast.error.fileValidationErrorWithName", { fileName: file.name, error }));
            });
          }
          onInvalidFiles?.(invalidFiles);
        }

        // Handle valid files
        if (validFiles.length > 0) {
          if (showToastOnSuccess && invalidFiles.length === 0) {
            const fileText = validFiles.length === 1 ? 'file' : 'files';
            toast.success(t("toast.success.filesReadyForUpload", { count: validFiles.length, fileText }));
          }
          onValidFiles?.(validFiles);
        }

        // If all files are invalid, show a general error
        if (validFiles.length === 0 && invalidFiles.length > 0 && showToastOnError) {
          toast.error(t("toast.error.noValidFilesSelected", { formats: supportedFormatsText }));
        }
      } catch (error) {
        console.error('File validation error:', error);
        if (showToastOnError) {
          toast.error(t("toast.error.fileValidationError"));
        }
      } finally {
        setIsValidating(false);
      }
    },
    [
      allowImages,
      allowVideos,
      canonicalPurpose,
      maxImageSize,
      maxVideoSize,
      customErrorMessages,
      onValidFiles,
      onInvalidFiles,
      showToastOnError,
      showToastOnSuccess,
      supportedFormatsText,
    ]
  );

  return {
    handleFileSelection,
    isValidating,
    acceptString,
    supportedFormatsText,
  };
};

export function validateCanonicalImage(file: File): string | null {
  const result = validateFile(file, { allowImages: true, allowVideos: false, maxImageSize: 5 * 1024 * 1024 });
  return result.isValid ? null : result.error ?? "Invalid image";
}
