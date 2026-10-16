/**
 * Activity Photo Upload Service
 * Handles downloading Google Photos and uploading to Strapi S3
 */

import axios from "axios";
import {explorersApiClient} from '../../../lib/explorersApiClient';
import {mediaContentUrl} from '../api/guidesViewModel';
import { 
  generateRandomFileName,
} from "../../../utils/uploadPathGenerator";
import { FetchedPhoto } from "../utils/googlePhotosService";
import type { UploadedActivityPhoto } from "../types/guideSectionTypes";


/**
 * Upload a single Google photo to Strapi S3 (internal helper)
 * @param photoUrl - Google Photo URL
 * @param username - User's username for path generation
 * @param sectionId - Guide section document ID
 * @param placeId - Google Place ID
 * @param photoIndex - Index of the photo
 * @param photoMetadata - Photo metadata (width, height, aspectRatio)
 * @returns Uploaded photo data
 */
const uploadActivityPhoto = async (
  photoUrl: string,
  photoIndex: number,
  photoMetadata: Pick<FetchedPhoto, 'width' | 'height' | 'aspectRatio'>
): Promise<UploadedActivityPhoto | null> => {
  try {
    // Fetch the photo from Google
    const photoResponse = await axios.get(photoUrl, {
      responseType: 'blob',
    });

    if (!photoResponse.data) {
      throw new Error("Failed to fetch photo from Google");
    }

    const photoBlob = photoResponse.data;
    const fileName = generateRandomFileName(`activity-${photoIndex}.jpg`);

    const media = await explorersApiClient.createMedia(
      new File([photoBlob], fileName, { type: "image/jpeg" }),
      "guide"
    );

    return {
      id: `activity-photo-${media.id}`,
      documentId: media.id,
      url: mediaContentUrl(media.id),
      fileName,
      width: photoMetadata.width,
      height: photoMetadata.height,
      aspectRatio: photoMetadata.aspectRatio,
    };
  } catch (error: any) {
    console.error("Error uploading activity photo:", error.response?.data || error.message);
    return null;
  }
};

/**
 * Upload multiple activity photos in parallel.
 *
 * Ticket 5.3: no username, section id or place id any more. Those existed only to compose
 * a storage path for Strapi's /upload, and the owned media endpoint decides its own keys -
 * so the caller no longer has to thread a username through the UI to save a photo.
 *
 * @param photos - Array of Google photos to upload
 * @returns Array of uploaded photo data
 */
export const uploadActivityPhotos = async (
  photos: FetchedPhoto[]
): Promise<UploadedActivityPhoto[]> => {
  if (!photos || photos.length === 0) {
    return [];
  }

  // Upload photos in parallel with limit of 4 concurrent uploads
  const uploadPromises = photos.map((photo, index) =>
    uploadActivityPhoto(
      photo.url,
      index,
      {
        width: photo.width,
        height: photo.height,
        aspectRatio: photo.aspectRatio,
      }
    )
  );

  const uploadedPhotos = await Promise.all(uploadPromises);
  
  // Filter out failed uploads
  return uploadedPhotos.filter(
    (photo): photo is UploadedActivityPhoto => photo !== null
  );
};
