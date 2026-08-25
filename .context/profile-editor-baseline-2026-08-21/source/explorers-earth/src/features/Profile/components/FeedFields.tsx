import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "../../../components/ui/Button";
import { EarthLoader } from "../../../components/EarthLoader";
import { AddIcon } from "../../../assets/icons/AddIcon";
import FeedLayout from "../../../components/ui/FeedLayout";
import MediaViewer from "../../../components/ui/MediaViewer";
import {
  useMediaViewer,
  convertToMediaItems,
} from "../../../hooks/useMediaViewer";
import { GOOGLE_PLACES_API_BASE_URL } from "../../../config";
import axios from "axios";
import { toast } from "sonner";
import useAuthStore from "../../../store/store";
import AddressInput from "./AddressInput";
import DeleteIcon from "../../../assets/icons/DeleteIcon";
import SwitchButton from "../../../components/ui/SwitchButton";
import {
  detectMediaAspectRatio,
  detectUrlAspectRatio,
  SupportedAspectRatio,
} from "../../../utils/aspectRatioUtils";
import {
  generateFeedUploadPath,
  generateRandomFileName,
  sanitizeUsername,
} from "../../../utils/uploadPathGenerator";
import { useFileUpload } from "../../../hooks/useFileUpload";

interface FeedFieldsProps {
  values: any;
  setFieldValue: (field: string, value: any) => void;
  onFeedDataChange?: () => void; // Callback to notify when Feed_Data changes
  onFormDirtyChange?: () => void; // Callback to mark form as dirty for any interaction
}

type FeedMedia = {
  id?: string;
  url: string;
  documentId?: string;
  fileName?: string;
  type?: "image" | "video";
  aspectRatio?: SupportedAspectRatio;
  width?: number;
  height?: number;
  uploadSource?: "manual" | "google-import"; // Track the source of upload
};

const MemoFeed = React.memo(FeedLayout);

const FeedFields: React.FC<FeedFieldsProps> = ({ values, setFieldValue, onFeedDataChange, onFormDirtyChange }) => {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  // importing state now represented by isFetching for Google fetch
  const [isUploading, setIsUploading] = useState(false);
  const { token, user } = useAuthStore();

  // MediaViewer state
  const {
    isOpen: isMediaViewerOpen,
    currentIndex,
    openViewer,
    closeViewer,
  } = useMediaViewer();

  // Inline importer state (decoupled from Business Location)
  const [showImporter, setShowImporter] = useState(false);
  const [searchAddress, setSearchAddress] = useState<string>("");
  const [selectedPlace, setSelectedPlace] = useState<any | null>(null);
  const [fetchedImages, setFetchedImages] = useState<FeedMedia[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isFetching, setIsFetching] = useState(false);

  // Instagram importer state
  const [showInstagramImporter, setShowInstagramImporter] = useState(false);
  const [igUsername, setIgUsername] = useState("");
  const [igFetchedMedia, setIgFetchedMedia] = useState<FeedMedia[]>([]);
  const [igSelectedIds, setIgSelectedIds] = useState<Set<string>>(new Set());
  const [isScrapingIg, setIsScrapingIg] = useState(false);

  // Handle validated files for upload
  const handleValidFiles = async (validFiles: File[]) => {
    setIsUploading(true);
    try {
      const uploads = await Promise.all(
        validFiles.map(async (file) => {
          // Generate structured path for feed media
          const mediaType = file.type.startsWith("video/")
            ? "videos"
            : "images";
          const username = sanitizeUsername(user?.username || "user");
          const randomFileName = generateRandomFileName(file.name);
          const structuredPath = generateFeedUploadPath(
            username,
            mediaType,
            randomFileName
          );

          // Upload the file with structured path
          const formData = new FormData();
          formData.append("files", file);
          formData.append("path", structuredPath);

          const resp = await axios.post(
            `${import.meta.env.VITE_REST_API_URL}/upload`,
            formData,
            {
              headers: {
                "Content-Type": "multipart/form-data",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            }
          );
          const item = resp.data?.[0];
          if (item?.url) {
            // Detect aspect ratio for the uploaded file
            try {
              const aspectRatioInfo = await detectMediaAspectRatio(file);
              return {
                id: `feed-uploaded-${item.id}`,
                url: item.url,
                documentId: item.documentId,
                fileName: file.name,
                type: file.type.startsWith("video/") ? "video" : "image",
                aspectRatio: aspectRatioInfo.aspectRatio,
                width: aspectRatioInfo.width,
                height: aspectRatioInfo.height,
                uploadSource: "manual", // Track upload source
              } as FeedMedia;
            } catch (aspectError) {
              console.warn(
                "Failed to detect aspect ratio for",
                file.name,
                aspectError
              );
              return {
                id: `feed-uploaded-${item.id}`,
                url: item.url,
                documentId: item.documentId,
                fileName: file.name,
                type: file.type.startsWith("video/") ? "video" : "image",
                aspectRatio: "4:5", // Default fallback
                width: 1080,
                height: 1350,
                uploadSource: "manual",
              } as FeedMedia;
            }
          }
          return null;
        })
      );

      const validUploads = uploads.filter(Boolean) as FeedMedia[];
      if (validUploads.length > 0) {
        const updated = [...feedItems, ...validUploads];
        setFieldValue("Feed_Data", updated);
        setFieldValue("feedUserFiles", validUploads); // for submit pipeline
        if (onFeedDataChange) onFeedDataChange();

        const fileText = validUploads.length === 1 ? "file" : "files";
        toast.success(
          `${validUploads.length} ${fileText} uploaded successfully`
        );
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(t('dashboard.profile.common.failedToUploadFiles'));
    } finally {
      setIsUploading(false);
    }
  };

  // File upload validation hook
  const { handleFileSelection, acceptString } = useFileUpload({
    allowImages: true,
    allowVideos: true,
    onValidFiles: handleValidFiles,
    showToastOnError: true,
    showToastOnSuccess: false, // We show custom success messages after upload
  });

  const feedItems: FeedMedia[] = Array.isArray(values.Feed_Data)
    ? values.Feed_Data
    : [];

  /**
   * Upload Google image to S3 with structured path
   * Downloads the image from Google and uploads to our S3 with proper path structure
   */
  const uploadGoogleImageToS3 = async (
    imageUrl: string,
    fileName: string
  ): Promise<FeedMedia | null> => {
    try {
      // Enhanced: Detect aspect ratio before uploading
      const aspectRatioInfo = await detectUrlAspectRatio(imageUrl, false);

      // Fetch the image from Google
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) throw new Error("Failed to fetch Google image");

      const imageBlob = await imageResponse.blob();

      // Generate structured path for Google import
      const username = sanitizeUsername(user?.username || "user");
      const randomFileName = generateRandomFileName(fileName);
      const structuredPath = generateFeedUploadPath(
        username,
        "google-import",
        randomFileName
      );

      // Upload to our S3 with structured path
      const formData = new FormData();
      formData.append(
        "files",
        new File([imageBlob], randomFileName, { type: imageBlob.type })
      );
      formData.append("path", structuredPath);

      const resp = await axios.post(
        `${import.meta.env.VITE_REST_API_URL}/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      const item = resp.data?.[0];
      if (item?.url) {
        return {
          id: `feed-google-${item.id}`,
          url: item.url,
          documentId: item.documentId,
          fileName: randomFileName,
          type: "image",
          aspectRatio: aspectRatioInfo.aspectRatio,
          width: aspectRatioInfo.width,
          height: aspectRatioInfo.height,
          uploadSource: "google-import",
        } as FeedMedia;
      }
      return null;
    } catch (error) {
      console.error("Error uploading Google image to S3:", error);
      return null;
    }
  };

  // Enhanced gallery that supports both images AND videos with aspect ratio info
  const galleryImages = useMemo(
    () =>
      (feedItems || []).map((media) => ({
        id: media.id || media.documentId || Math.random().toString(36).slice(2),
        url: media.url,
        alt:
          media.fileName || (media.type === "video" ? t('dashboard.profile.common.video') : t('dashboard.profile.common.feedImage')),
        type: media.type || "image",
        aspectRatio: media.aspectRatio,
        width: media.width,
        height: media.height,
        fileName: media.fileName,
      })),
    [feedItems]
  );

  // Convert for MediaViewer
  const mediaViewerItems = useMemo(() => {
    return convertToMediaItems(feedItems);
  }, [feedItems]);

  // Handle media click to open viewer
  // Only allow images to open the media viewer, videos should not trigger it
  const handleMediaClick = (index: number) => {
    // Get the media item at the clicked index
    const mediaItem = feedItems[index];

    // Only open viewer for images, not videos
    if (mediaItem && mediaItem.type !== "video") {
      openViewer(index);
    }
    // Videos will not trigger the media viewer - they continue playing inline
  };

  const handleAddClick = () => fileRef.current?.click();

  const toggleImporter = () => {
    setShowImporter((prev) => !prev);
    if (showImporter) {
      // reset when hiding
      setSearchAddress("");
      setSelectedPlace(null);
      setFetchedImages([]);
      setSelectedIds(new Set());
    }
    // Close Instagram importer when Google opens
    if (!showImporter) {
      setShowInstagramImporter(false);
      setIgFetchedMedia([]);
      setIgSelectedIds(new Set());
    }
    // Mark form as dirty when user toggles Google switch
    if (onFormDirtyChange) {
      onFormDirtyChange();
    }
  };

  const toggleInstagramImporter = () => {
    setShowInstagramImporter((prev) => !prev);
    if (showInstagramImporter) {
      // reset when hiding
      setIgUsername("");
      setIgFetchedMedia([]);
      setIgSelectedIds(new Set());
    }
    // Close Google importer when Instagram opens
    if (!showInstagramImporter) {
      setShowImporter(false);
      setFetchedImages([]);
      setSelectedIds(new Set());
    }
    if (onFormDirtyChange) {
      onFormDirtyChange();
    }
  };

  const INSTAGRAM_API_URL = import.meta.env.VITE_INSTAGRAM_API_URL || 'http://localhost:5000';

  const fetchInstagramMedia = async () => {
    if (!igUsername.trim()) {
      toast.error("Please enter an Instagram username or profile URL");
      return;
    }

    setIsScrapingIg(true);
    setIgFetchedMedia([]);
    setIgSelectedIds(new Set());

    try {
      // Extract username from input
      let username = igUsername.trim();
      if (username.includes('instagram.com/')) {
        const urlMatch = username.match(/instagram\.com\/([^/?]+)/);
        if (urlMatch && urlMatch[1]) {
          username = urlMatch[1];
        }
      }
      if (username.startsWith('@')) username = username.slice(1);

      const response = await axios.post(
        `${INSTAGRAM_API_URL}/api/instagram/account-posts`,
        { username, maxScrolls: 20 },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000, // 5 min
        }
      );

      if (response.data.success && response.data.data) {
        const { posts, totalMedia } = response.data.data;

        // Flatten all media items from all posts into a single FeedMedia array
        const allMedia: FeedMedia[] = [];
        for (const post of posts) {
          if (post.media && Array.isArray(post.media)) {
            for (let i = 0; i < post.media.length; i++) {
              const m = post.media[i];
              const id = `ig-${post.shortcode}-${i}`;
              // Build proxy URL for display
              const proxyUrl = `${INSTAGRAM_API_URL}/api/instagram/media-proxy?url=${encodeURIComponent(m.url)}&token=${encodeURIComponent(token || '')}`;
              allMedia.push({
                id,
                url: proxyUrl,               // proxied URL for display
                fileName: `ig-${post.shortcode}-${i}.${m.type === 'video' ? 'mp4' : 'jpg'}`,
                type: m.type || 'image',
                width: m.width,
                height: m.height,
                uploadSource: 'manual',       // will be re-uploaded to S3
              });
            }
          }
        }

        setIgFetchedMedia(allMedia);
        // Select all by default
        setIgSelectedIds(new Set(allMedia.map(m => m.id!)));
        toast.success(`Found ${totalMedia} media items from ${posts.length} posts`);
      } else {
        toast.error("Failed to scrape Instagram account");
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || "Failed to scrape Instagram account";
      toast.error(errorMsg);
    } finally {
      setIsScrapingIg(false);
    }
  };

  /**
   * Upload an Instagram image to S3 with structured path.
   * Downloads via proxy and re-uploads to our storage.
   */
  const uploadInstagramImageToS3 = async (
    proxyImageUrl: string,
    fileName: string,
    mediaType: 'image' | 'video' = 'image'
  ): Promise<FeedMedia | null> => {
    try {
      // Fetch the image through our proxy
      const imageResponse = await fetch(proxyImageUrl);
      if (!imageResponse.ok) throw new Error("Failed to fetch Instagram image via proxy");

      const imageBlob = await imageResponse.blob();

      // Detect aspect ratio
      let aspectRatioInfo: { aspectRatio: SupportedAspectRatio; width: number; height: number } = {
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
      };
      if (mediaType === 'image') {
        try {
          const tempUrl = URL.createObjectURL(imageBlob);
          aspectRatioInfo = await detectUrlAspectRatio(tempUrl, false);
          URL.revokeObjectURL(tempUrl);
        } catch { /* fallback to default */ }
      }

      // Generate structured path for Instagram import
      const username = sanitizeUsername(user?.username || 'user');
      const randomFileName = generateRandomFileName(fileName);
      const structuredPath = generateFeedUploadPath(username, 'instagram-import', randomFileName);

      // Upload to our S3
      const formData = new FormData();
      formData.append('files', new File([imageBlob], randomFileName, { type: imageBlob.type }));
      formData.append('path', structuredPath);

      const resp = await axios.post(
        `${import.meta.env.VITE_REST_API_URL}/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      const item = resp.data?.[0];
      if (item?.url) {
        return {
          id: `feed-ig-${item.id}`,
          url: item.url,
          documentId: item.documentId,
          fileName: randomFileName,
          type: mediaType,
          aspectRatio: aspectRatioInfo.aspectRatio,
          width: aspectRatioInfo.width,
          height: aspectRatioInfo.height,
          uploadSource: 'manual',
        } as FeedMedia;
      }
      return null;
    } catch (error) {
      console.error('Error uploading Instagram image to S3:', error);
      return null;
    }
  };

  const saveSelectedInstagramToFeed = async () => {
    const selected = igFetchedMedia.filter(
      (img) => img.id && igSelectedIds.has(img.id)
    );
    if (selected.length === 0) {
      toast.error("Select at least one media item");
      return;
    }

    // Only upload images (skip videos for now as they are large)
    const imageItems = selected.filter(item => item.type !== 'video');
    const videoCount = selected.length - imageItems.length;
    if (videoCount > 0) {
      toast.info(`Skipping ${videoCount} video(s) — only images are uploaded to feed`);
    }

    if (imageItems.length === 0) {
      toast.error("No images selected to upload (videos are not supported for feed)");
      return;
    }

    try {
      setIsUploading(true);
      toast.info(`Uploading ${imageItems.length} images to feed...`);

      const uploadPromises = imageItems.map(async (img) => {
        return uploadInstagramImageToS3(
          img.url,
          img.fileName || 'ig-image.jpg',
          (img.type || 'image') as 'image' | 'video'
        );
      });

      const uploadResults = await Promise.all(uploadPromises);
      const successfulUploads = uploadResults.filter(Boolean) as FeedMedia[];

      if (successfulUploads.length > 0) {
        const merged = [...feedItems, ...successfulUploads];
        setFieldValue('Feed_Data', merged);
        setFieldValue('feedImportedMedia', successfulUploads);
        if (onFeedDataChange) onFeedDataChange();

        toast.success(`${successfulUploads.length} image(s) uploaded to feed successfully`);

        // Reset Instagram importer
        setShowInstagramImporter(false);
        setIgUsername('');
        setIgFetchedMedia([]);
        setIgSelectedIds(new Set());
      } else {
        toast.error("Failed to upload any images");
      }
    } catch (error) {
      console.error('Error saving Instagram images to feed:', error);
      toast.error("Failed to save images to feed");
    } finally {
      setIsUploading(false);
    }
  };

  const igToggleSelect = (id: string) => {
    setIgSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Remove media overlay action (now supports both images and videos)
  const handleRemoveByGalleryIndex = (galleryIndex: number) => {
    // Since galleryImages now includes all media (images + videos),
    // the gallery index directly corresponds to the Feed_Data index
    if (galleryIndex >= feedItems.length) return;

    // Directly remove without confirmation
    const updated = feedItems.filter((_, i) => i !== galleryIndex);
    setFieldValue("Feed_Data", updated);
    if (onFeedDataChange) onFeedDataChange();

    const removedItem = feedItems[galleryIndex];
    const itemType = removedItem?.type || "item";
    toast.success(t('toast.success.itemRemovedFromFeed', { itemType }));
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Use our validation system
    handleFileSelection(files);

    // Clear the input value to allow re-uploading the same file if needed
    if (fileRef.current) fileRef.current.value = "";
  };

  const fetchGoogleImages = async () => {
    if (!selectedPlace?.place_id) {
      toast.error(t('toast.error.searchAndSelectPlaceFirst'));
      return;
    }
    const placeId = selectedPlace.place_id as string;
    setIsFetching(true);
    try {
      const details = await axios.get(
        `${GOOGLE_PLACES_API_BASE_URL}/${placeId}?fields=photos&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        }`
      );
      const refs: string[] = (details.data?.photos || [])
        .map((p: { name: string }) => p.name.split(`${placeId}/`)[1])
        .filter(Boolean);
      const limited = refs.slice(0, 12);
      let imported: FeedMedia[] = [];
      if (limited.length > 0) {
        imported = await Promise.all(
          limited.map(async (ref, i) => {
            const direct = `${GOOGLE_PLACES_API_BASE_URL}/${placeId}/${ref}/media?maxWidthPx=800&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY
              }`;
            // Best-effort availability check
            try {
              const r = await fetch(direct);
              if (!r.ok) throw new Error("fetch failed");
            } catch { /* probe only — a failed HEAD fetch is acceptable */ }
            return {
              id: `google-${placeId}-${i}`,
              url: direct,
              fileName: `${selectedPlace.name || "place"}-${i}.jpg`,
              type: "image",
              uploadSource: "google-import",
            } as FeedMedia;
          })
        );
      }

      if (imported.length === 0) {
        // Fallback to Google Custom Search
        try {
          const query = `${selectedPlace.name || ""} ${selectedPlace.formatted_address || ""
            }`.trim();
          const resp = await axios.get(
            `https://www.googleapis.com/customsearch/v1`,
            {
              params: {
                key: import.meta.env.VITE_GOOGLE_SEARCH_API_KEY,
                cx: import.meta.env.VITE_GOOGLE_SEARCH_ENGINE_ID,
                q: query,
                searchType: "image",
                num: 10,
                imgSize: "large",
                imgType: "photo",
              },
            }
          );
          imported = (resp.data?.items || []).map(
            (item: { link: string; title: string }, i: number) => ({
              id: `gcs-${Date.now()}-${i}`,
              url: item.link,
              fileName: item.title || `google-${i}.jpg`,
              type: "image",
              uploadSource: "google-import",
            })
          );
        } catch (e) {
          console.error("Custom Search fallback failed", e);
        }
      }

      if (imported.length === 0) {
        toast.error(t('toast.error.noImagesFoundForPlace'));
        setFetchedImages([]);
        setSelectedIds(new Set());
        return;
      }

      // Enhanced: Add aspect ratio detection for imported images
      const imagesWithAspectRatio = await Promise.all(
        imported.map(async (img) => {
          try {
            const aspectRatioInfo = await detectUrlAspectRatio(img.url, false);
            return {
              ...img,
              aspectRatio: aspectRatioInfo.aspectRatio,
              width: aspectRatioInfo.width,
              height: aspectRatioInfo.height,
            };
          } catch (error) {
            console.warn(
              `Failed to detect aspect ratio for ${img.url}:`,
              error
            );
            // Fallback to 4:5 aspect ratio (common for social media)
            return {
              ...img,
              aspectRatio: "4:5" as SupportedAspectRatio,
              width: 800,
              height: 1000,
            };
          }
        })
      );

      setFetchedImages(imagesWithAspectRatio);
      setSelectedIds(new Set());

      // Enhanced success message with aspect ratio info
      const aspectRatioInfo = imagesWithAspectRatio
        .filter((item) => item.aspectRatio)
        .reduce((acc, item) => {
          acc[item.aspectRatio!] = (acc[item.aspectRatio!] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      let message = t('toast.success.fetchedImages', { count: imagesWithAspectRatio.length });
      if (Object.keys(aspectRatioInfo).length > 0) {
        const ratioDetails = Object.entries(aspectRatioInfo)
          .map(([ratio, count]) => `${count}x ${ratio}`)
          .join(", ");
        message += ` (${ratioDetails})`;
      }

      toast.success(message);
    } catch (err) {
      console.error("Google fetch failed", err);
      toast.error(t('toast.error.failedToFetchImages'));
    } finally {
      setIsFetching(false);
    }
  };

  // Auto-fetch images as soon as a place is selected from autocomplete (when importer is open)
  useEffect(() => {
    if (!showImporter) return;
    if (!selectedPlace?.place_id) return;
    // Clear previous results/selection and fetch for new place
    setFetchedImages([]);
    setSelectedIds(new Set());
    fetchGoogleImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlace?.place_id, showImporter]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveSelectedToFeed = async () => {
    const selected = fetchedImages.filter(
      (img) => img.id && selectedIds.has(img.id)
    );
    if (selected.length === 0) {
      toast.error(t('toast.error.selectAtLeastOneImage'));
      return;
    }

    try {
      setIsUploading(true);
      toast.info(t('toast.success.uploadingImagesToFeed'));

      // Upload each selected Google image to S3 with structured path
      const uploadPromises = selected.map(async (img) => {
        const uploadedImage = await uploadGoogleImageToS3(
          img.url,
          img.fileName || "google-image.jpg"
        );
        return uploadedImage;
      });

      const uploadResults = await Promise.all(uploadPromises);
      const successfulUploads = uploadResults.filter(Boolean) as FeedMedia[];

      if (successfulUploads.length > 0) {
        const merged = [...feedItems, ...successfulUploads];
        setFieldValue("Feed_Data", merged);
        setFieldValue("feedImportedMedia", successfulUploads);
        if (onFeedDataChange) onFeedDataChange();

        // Enhanced success message with aspect ratio info
        const aspectRatioInfo = successfulUploads
          .filter((item) => item.aspectRatio)
          .reduce((acc, item) => {
            acc[item.aspectRatio!] = (acc[item.aspectRatio!] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

        let message = t('toast.success.imagesUploadedToFeed', { count: successfulUploads.length });
        if (Object.keys(aspectRatioInfo).length > 0) {
          const ratioDetails = Object.entries(aspectRatioInfo)
            .map(([ratio, count]) => `${count}x ${ratio}`)
            .join(", ");
          message += ` (${ratioDetails})`;
        }

        toast.success(message);

        // Reset importer state after successful upload
        setShowImporter(false);
        setSearchAddress("");
        setSelectedPlace(null);
        setFetchedImages([]);
        setSelectedIds(new Set());
      } else {
        toast.error(t('dashboard.profile.common.failedToUploadImages'));
      }
    } catch (error) {
      console.error("Error saving images to feed:", error);
      toast.error(t('dashboard.profile.common.failedToSaveImagesToFeed'));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full bg-dashboard-sidebar rounded-lg">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h2 className="font-poppins text-sm text-white">{t('dashboard.profile.publicProfile.sections.feed')}</h2>
          {/* Desktop/tablet controls */}
          <div className="hidden md:flex items-center gap-4">
            <Button
              variant="primary"
              size="xsmall"
              btnText={t('dashboard.profile.common.add')}
              endIcon={<AddIcon size="5" />}
              onClickHandler={handleAddClick}
              disabled={isUploading}
            />
            {/* Google Import Toggle */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-white font-poppins">
                Google
              </span>
              <SwitchButton
                isChecked={showImporter}
                onChange={toggleImporter}
                variant="purple"
                disabled={isFetching}
              />
              {isFetching && (
                <span className="text-xs text-dashboard-accent animate-pulse">
                  {t('dashboard.profile.common.fetching')}
                </span>
              )}
            </div>
            {/* Instagram Import Toggle */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-white font-poppins">
                Instagram
              </span>
              <SwitchButton
                isChecked={showInstagramImporter}
                onChange={toggleInstagramImporter}
                variant="purple"
                disabled={isScrapingIg}
              />
              {isScrapingIg && (
                <span className="text-xs text-pink-400 animate-pulse">
                  Scraping...
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Mobile controls (compact) */}
        <div className="mt-3 flex items-center justify-between md:hidden">
          <Button
            variant="primary"
            size="xsmall"
            btnText={t('dashboard.profile.common.add')}
            endIcon={<AddIcon size="5" />}
            onClickHandler={handleAddClick}
            disabled={isUploading}
          />
          <div className="flex items-center gap-3">
            {/* Google Import Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white font-poppins">Google</span>
              <SwitchButton
                isChecked={showImporter}
                onChange={toggleImporter}
                variant="purple"
                disabled={isFetching}
              />
            </div>
            {/* Instagram Import Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white font-poppins">IG</span>
              <SwitchButton
                isChecked={showInstagramImporter}
                onChange={toggleInstagramImporter}
                variant="purple"
                disabled={isScrapingIg}
              />
            </div>
          </div>
        </div>
      </div>

      {showImporter && (
        <div className="w-full bg-dashboard-sidebar border-dashboard rounded-lg p-4 mb-4">
          <div className="flex flex-col gap-3">
            <label className="text-xs text-white">{t("dashboard.recommendations.addRecommendationForm.searchLocation.label")}</label>
            <AddressInput
              type="address"
              label={t("dashboard.recommendations.addRecommendationForm.searchLocation.searchPlace")}
              value={searchAddress}
              onChange={(val) => {
                setSearchAddress(val);
                // Mark form as dirty when user types in search address input
                if (onFormDirtyChange) {
                  onFormDirtyChange();
                }
              }}
              setPlaces={(place) => {
                setSelectedPlace(place);
                // Mark form as dirty when user selects a place
                if (onFormDirtyChange) {
                  onFormDirtyChange();
                }
              }}
              placeHolder={t("dashboard.recommendations.addRecommendationForm.searchLocation.placeholder")}
            />
            {isFetching && (
              <span className="text-xs text-white">{t("dashboard.recommendations.addRecommendationForm.fetchingImages")}</span>
            )}

            {fetchedImages.length > 0 && (
              <div className="bg-dashboard-sidebar rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white">
                    {selectedIds.size} selected of {fetchedImages.length}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="whiteText"
                      size="xsmall"
                      btnText={t('dashboard.profile.common.selectAll')}
                      onClickHandler={() =>
                        setSelectedIds(
                          new Set(
                            fetchedImages
                              .map((f) => f.id!)
                              .filter((id): id is string => Boolean(id))
                          )
                        )
                      }
                    />
                    <Button
                      variant="whiteText"
                      size="xsmall"
                      btnText={t('dashboard.profile.common.clearSelection')}
                      onClickHandler={() => setSelectedIds(new Set())}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {fetchedImages.map((img) => {
                    const isSel = img.id ? selectedIds.has(img.id) : false;
                    return (
                      <button
                        key={img.id}
                        type="button"
                        className="relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:ring-offset-2 rounded-lg transition-all duration-200"
                        onClick={() => img.id && toggleSelect(img.id)}
                        aria-label={`${isSel ? "Deselect" : "Select"
                          } image for feed`}
                      >
                        <img
                          src={img.url}
                          alt={img.fileName || t('dashboard.profile.common.importedImage')}
                          className="w-full h-32 object-cover rounded-lg border-2 border-transparent group-hover:border-dashboard-accent/50 transition-all duration-200"
                          loading="lazy"
                        />
                        <div
                          className={`absolute inset-0 rounded-lg transition-all duration-200 ${isSel
                            ? "bg-dashboard-accent/30 ring-2 ring-dashboard-accent ring-offset-2"
                            : "bg-black/0 group-hover:bg-black/10"
                            }`}
                        />
                        <div
                          className="absolute top-2 right-2"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (img.id) toggleSelect(img.id);
                          }}
                        >
                          <div
                            className={`inline-flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-full text-sm md:text-base font-bold transition-all duration-200 shadow-lg border-2 cursor-pointer ${isSel
                              ? "bg-dashboard-accent text-white border-dashboard-accent scale-110"
                              : "bg-dashboard-sidebar text-dashboard-light border-dashboard hover:bg-dashboard-muted/80 hover:scale-105"
                              }`}
                          >
                            {isSel ? (
                              <svg
                                className="w-4 h-4 md:w-5 md:h-5"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                aria-hidden="true"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="w-4 h-4 md:w-5 md:h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth="3"
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-end mt-3 gap-2">
                  <Button
                    variant="primary"
                    size="xsmall"
                    btnText={t('dashboard.profile.common.saveToFeed')}
                    onClickHandler={saveSelectedToFeed}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instagram Importer Panel */}
      {showInstagramImporter && (
        <div className="w-full bg-dashboard-sidebar border-dashboard rounded-lg p-4 mb-4">
          <div className="flex flex-col gap-3">
            <label className="block text-sm font-poppins text-white font-semibold mb-1">
              Import media from an Instagram account
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={igUsername}
                onChange={(e) => setIgUsername(e.target.value)}
                placeholder="username or https://instagram.com/username"
                className="w-full placeholder:text-dashboard-muted outline-none p-3 border border-dashboard bg-dashboard-muted font-poppins rounded-md text-sm text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent hover:border-dashboard-accent focus:bg-dashboard-muted"
                disabled={isScrapingIg}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') fetchInstagramMedia();
                }}
              />
              <Button
                variant="primary"
                size="medium"
                btnText={isScrapingIg ? "Fetching..." : "Fetch"}
                onClickHandler={fetchInstagramMedia}
                disabled={isScrapingIg || !igUsername.trim()}
              />
            </div>

            {/* Scraping status */}
            {isScrapingIg && (
              <div className="flex justify-center py-6 mt-2 bg-dashboard-muted/10 rounded-lg border border-dashed border-dashboard-muted/30">
                <EarthLoader context="scraping" size="small" />
              </div>
            )}

            {/* Fetched Instagram media */}
            {igFetchedMedia.length > 0 && (
              <div className="bg-dashboard-sidebar rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white">
                    {igSelectedIds.size} selected of {igFetchedMedia.length}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="whiteText"
                      size="xsmall"
                      btnText={t('dashboard.profile.common.selectAll')}
                      onClickHandler={() =>
                        setIgSelectedIds(
                          new Set(
                            igFetchedMedia
                              .map((f) => f.id!)
                              .filter((id): id is string => Boolean(id))
                          )
                        )
                      }
                    />
                    <Button
                      variant="whiteText"
                      size="xsmall"
                      btnText={t('dashboard.profile.common.clearSelection')}
                      onClickHandler={() => setIgSelectedIds(new Set())}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {igFetchedMedia.map((img) => {
                    const isSel = img.id ? igSelectedIds.has(img.id) : false;
                    const isVideo = img.type === 'video';
                    return (
                      <button
                        key={img.id}
                        type="button"
                        className="relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 rounded-lg transition-all duration-200"
                        onClick={() => img.id && igToggleSelect(img.id)}
                        aria-label={`${isSel ? "Deselect" : "Select"
                          } media for feed`}
                      >
                        {isVideo ? (
                          <video
                            src={img.url}
                            className="w-full h-32 object-cover rounded-lg border-2 border-transparent group-hover:border-pink-500/50 transition-all duration-200"
                            muted
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={img.url}
                            alt={img.fileName || "Instagram media"}
                            className="w-full h-32 object-cover rounded-lg border-2 border-transparent group-hover:border-pink-500/50 transition-all duration-200"
                            loading="lazy"
                          />
                        )}
                        {/* Video badge */}
                        {isVideo && (
                          <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>
                            Video
                          </div>
                        )}
                        <div
                          className={`absolute inset-0 rounded-lg transition-all duration-200 ${isSel
                            ? "bg-pink-500/30 ring-2 ring-pink-500 ring-offset-2"
                            : "bg-black/0 group-hover:bg-black/10"
                            }`}
                        />
                        <div
                          className="absolute top-2 right-2"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (img.id) igToggleSelect(img.id);
                          }}
                        >
                          <div
                            className={`inline-flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-full text-sm md:text-base font-bold transition-all duration-200 shadow-lg border-2 cursor-pointer ${isSel
                              ? "bg-pink-500 text-white border-pink-500 scale-110"
                              : "bg-dashboard-sidebar text-dashboard-light border-dashboard hover:bg-dashboard-muted/80 hover:scale-105"
                              }`}
                          >
                            {isSel ? (
                              <svg
                                className="w-4 h-4 md:w-5 md:h-5"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                aria-hidden="true"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="w-4 h-4 md:w-5 md:h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth="3"
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-end mt-3 gap-2">
                  <Button
                    variant="primary"
                    size="xsmall"
                    btnText={isUploading ? "Uploading..." : t('dashboard.profile.common.saveToFeed')}
                    onClickHandler={saveSelectedInstagramToFeed}
                    disabled={isUploading || igSelectedIds.size === 0}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enhanced Feed Grid - Now supports both images and videos with optimal aspect ratios */}
      <MemoFeed
        images={galleryImages}
        className="w-full always-show-overlays"
        rowHeight={120}
        margin={3}
        onImageClick={handleMediaClick}
        videoCursorPointer={false}
        getOverlay={(media, index) => (
          <div className="flex px-0 flex-col absolute top-0 right-0 z-10 bg-white-overlay rounded-tr-xl rounded-bl-xl">
            <button
              type="button"
              aria-label={`Remove ${media.type || "media"}`}
              className="flex items-center justify-center p-1 text-white transition-colors"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRemoveByGalleryIndex(index);
              }}
            >
              <DeleteIcon stroke="var(--dash-danger)" size="size-4" />
            </button>
          </div>
        )}
      />

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept={acceptString}
        multiple
        onChange={handleFilesSelected}
      />

      {/* MediaViewer for feed media */}
      <MediaViewer
        mediaItems={mediaViewerItems}
        initialIndex={currentIndex}
        isOpen={isMediaViewerOpen}
        onClose={closeViewer}
      />
    </div>
  );
};

export default FeedFields;
