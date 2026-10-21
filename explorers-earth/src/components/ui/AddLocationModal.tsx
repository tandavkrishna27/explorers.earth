import React, { useState, useEffect } from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import Modal from './Modal';
import Button from './Button';
import AddressInput from '../../features/Profile/components/AddressInput';
import { Places } from '../../features/Profile/types/types';
import useAuthStore from '../../store/store';
import { getCurrentDomain } from '../../utils/getCurrentDomain';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface AddLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: any) => void | boolean | Promise<void | boolean>;
  isEditing?: boolean;
  initialValues?: any;
  existingPlaces?: any[];
}

const AddLocationModal: React.FC<AddLocationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isEditing = false,
  initialValues = {},
  existingPlaces = [],
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [places, setPlaces] = useState<Places | null>(null);
  const [fetchedListName, setFetchedListName] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const url = getCurrentDomain();

  // Initialize fetchedListName with initial values when editing, reset when adding new
  useEffect(() => {
    if (isEditing && initialValues?.listName) {
      setFetchedListName(initialValues.listName);
    } else if (!isEditing) {
      // Reset fetchedListName and places when adding a new location
      setFetchedListName('');
      setPlaces(null);
    }
  }, [isEditing, initialValues?.listName]);

  // Function to extract city name from place data
  const extractCityName = (place: any) => {
    if (!place?.address_components) return place?.name || '';

    const cityTypes = [
      'locality', // City/Town
      'sublocality', // Neighborhood/Suburb
      'administrative_area_level_2', // County/District
      'administrative_area_level_3', // Sub-district
    ];

    for (const component of place.address_components) {
      for (const cityType of cityTypes) {
        if (component.types.includes(cityType)) {
          return component.long_name;
        }
      }
    }

    // Fallback to place name if no city found
    return place?.name || '';
  };

  // Default initial values
  const defaultInitialValues = {
    listName: '',
    recommendationSocialLink: '',
    note: '',
    placeUrl: '',
    ...initialValues
  };

  // Validation schema
  const validationSchema = Yup.object({
    listName: Yup.string().required('List Name is Required'),
    recommendationSocialLink: Yup.string(),
    note: Yup.string(),
    placeUrl: Yup.string().required('Url name is Required'),
  });

  const handleListNameChange = (
    value: string,
    setFieldValue: (field: string, value: string) => void
  ) => {
    setFetchedListName(value);

    // If a place is selected, use the extracted city name
    if (places) {
      const cityName = extractCityName(places);
      setFieldValue("listName", cityName);

      // Create a slug from the city name
      const slug = cityName
        .toLowerCase()
        .replace(/,/g, "")
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, "-")
        .replace(/-+/g, '-')
        .trim();
      setFieldValue("placeUrl", slug);
    } else {
      // Fallback to manual input
      setFieldValue("listName", value);

      // Create a slug from the manual input
      const slug = value
        .toLowerCase()
        .replace(/,/g, "")
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, "-")
        .replace(/-+/g, '-')
        .trim();
      setFieldValue("placeUrl", slug);
    }
  };

  const handleSubmit = async (values: any) => {
    // Check if a place has been selected (only for new locations, not when editing)
    if (!isEditing && !places?.place_id) {
      toast.error(t("toast.error.pleaseSelectLocation"));
      return;
    }

    // Extract city name and get place_id
    const cityName = isEditing ? initialValues.listName : extractCityName(places);
    const currentPlaceId = isEditing ? (initialValues?.placeId || null) : places?.place_id;
    
    // Check for duplicates by place_id (exclude current location when editing)
    if (existingPlaces && existingPlaces.length > 0) {
      const isDuplicate = existingPlaces.some((place) => {
        // Skip duplicate check for the current location when editing
        if (isEditing && initialValues?.documentId && place?.documentId === initialValues.documentId) {
          return false;
        }
        
        // Extract place_id from List_Name_Details if it exists
        let existingPlaceId = null;
        if (place?.List_Name_Details) {
          // Handle both string (JSON) and object formats
          try {
            const details = typeof place.List_Name_Details === 'string' 
              ? JSON.parse(place.List_Name_Details) 
              : place.List_Name_Details;
            existingPlaceId = details?.place_id || null;
          } catch {
            // If parsing fails, treat as object or null
            existingPlaceId = place.List_Name_Details?.place_id || null;
          }
        }
        
        // Normalize place_ids for comparison (trim whitespace)
        const normalizedCurrentPlaceId = currentPlaceId ? String(currentPlaceId).trim() : null;
        const normalizedExistingPlaceId = existingPlaceId ? String(existingPlaceId).trim() : null;
        
        // Primary check: Compare by place_id if current location has place_id
        if (normalizedCurrentPlaceId) {
          // If current location has place_id, only check against existing places with place_id
          if (normalizedExistingPlaceId) {
            return normalizedCurrentPlaceId === normalizedExistingPlaceId;
          }
          // If current has place_id but existing doesn't, it's not a duplicate
          // (we can't verify without place_id, so allow it)
          return false;
        }
        
        // Fallback: Only use name comparison if NEITHER location has place_id
        // This handles legacy data, but be more lenient - compare full formatted address if available
        if (!normalizedCurrentPlaceId && !normalizedExistingPlaceId) {
          // Compare by full formatted address if available, otherwise by name
          const currentAddress = places?.formatted_address?.toLowerCase() || cityName.toLowerCase();
          const existingAddress = place?.List_Name_Details?.location?.address?.toLowerCase() || place?.List_Name?.toLowerCase();
          return currentAddress === existingAddress;
        }
        
        // If existing has place_id but current doesn't, it's not a duplicate
        return false;
      });

      if (isDuplicate) {
        toast.error(t("toast.error.locationAlreadyExists"));
        return;
      }
    }

    // Add the placeId and use city name
    const submissionValues = {
      ...values,
      listName: cityName, // Use extracted city name instead of manual input
      placeId: currentPlaceId,
    };

    // Await the submit and close ONLY on explicit success. All three submitters
    // now return Promise<boolean> (true = success), so a failed create/update
    // keeps the modal open with the user's input intact.
    setSubmitting(true);
    try {
      const ok = await onSubmit(submissionValues);
      if (ok === true) {
        onClose();
        // This tells walkthrough step is finished
        window.__walkthrough?.markProcessingCompleteRef?.();
      }
    } catch (err) {
      // A submitter should return false rather than throw, but guard anyway so a
      // throw never leaks past the modal (and never closes it).
      console.error("Location submit failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="dashboard-theme flex flex-col gap-3 sm:gap-4 md:gap-6 w-full mx-auto py-2 sm:py-4 md:py-6 px-3 sm:px-6 md:px-8">
        <h2 className="dt-heading mb-1 sm:mb-2">
          {isEditing ? t("dashboard.categoryPages.updateLocation") : t("dashboard.categoryPages.addLocation")}
        </h2>

        <Formik
          initialValues={defaultInitialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
          enableReinitialize
        >
          {({ errors, touched, setFieldValue }) => (
            <Form className="flex flex-col gap-3 sm:gap-4 md:gap-6">
              {/* Search Location Field */}
              <div className="flex flex-col gap-2">
                <label className="dt-label text-sm font-medium">
                  Search Location
                </label>
                <AddressInput
                  setPlaces={setPlaces}
                  type="listName"
                  label="List Name"
                  initalValue={defaultInitialValues.listName}
                  value={fetchedListName}
                  onChange={(value: string) => handleListNameChange(value, setFieldValue)}
                  placeHolder="Enter city, state, or country (Eg. Paris)"
                  disabled={isEditing}
                  className={isEditing ? "cursor-not-allowed" : ""}
                />
                {places?.formatted_address && (
                  <div className="text-xs text-dashboard-accent bg-dashboard-muted p-2 rounded">
                    Selected: {extractCityName(places)}
                  </div>
                )}
                {errors.listName && touched.listName && (
                  <span className="text-xs font-poppins text-dashboard-danger">
                    {typeof errors.listName === 'string' ? errors.listName : String(errors.listName)}
                  </span>
                )}
              </div>

              {/* Recommendation Social Link Field */}
              <div className="flex flex-col gap-2">
                <label className="dt-label text-sm font-medium">
                  Recommendation Social Link
                </label>
                <Field
                  name="recommendationSocialLink"
                  type="text"
                  placeholder="Enter URL (Youtube / Instagram)"
                  className="w-full dt-input"
                />
                {errors.recommendationSocialLink && touched.recommendationSocialLink && (
                  <span className="text-xs font-poppins text-dashboard-danger">
                    {typeof errors.recommendationSocialLink === 'string' ? errors.recommendationSocialLink : String(errors.recommendationSocialLink)}
                  </span>
                )}
              </div>

              {/* Note Field */}
              <div className="flex flex-col gap-2">
                <label className="dt-label text-sm font-medium">
                  Note
                </label>
                <Field
                  name="note"
                  as="textarea"
                  placeholder="Enter a note related to your Recommendation"
                  className="w-full dt-input min-h-[60px] sm:min-h-[80px] md:min-h-[100px] resize-none"
                />
                {errors.note && touched.note && (
                  <span className="text-xs font-poppins text-dashboard-danger">
                    {typeof errors.note === 'string' ? errors.note : String(errors.note)}
                  </span>
                )}
              </div>

              {/* Place URL Field */}
              <div className="flex flex-col gap-2">
                <label className="dt-label text-sm font-medium">
                  Place URL
                </label>
                <div className="flex w-full md:flex-row flex-col items-center gap-2">
                  <label className="dt-label md:font-medium font-poppins text-dashboard-light">
                    {url}/{user?.username}/
                  </label>
                  <Field
                    name="placeUrl"
                    type="text"
                    placeholder="Enter the Name to a create a Shareable link"
                    className="w-full dt-input"
                  />
                </div>
                {errors.placeUrl && touched.placeUrl && (
                  <span className="text-xs font-poppins text-dashboard-danger">
                    {typeof errors.placeUrl === 'string' ? errors.placeUrl : String(errors.placeUrl)}
                  </span>
                )}
              </div>

              {/* Submit and Cancel Buttons */}
              <div className="flex justify-end gap-3 mt-3 sm:mt-4 md:mt-6">
                <Button
                  type="button"
                  btnText="Cancel"
                  variant="danger"
                  size="medium"
                  onClickHandler={onClose}
                />
                <Button
                  type="submit"
                  btnText={isEditing ? t("dashboard.categoryPages.updateLocation") : t("dashboard.categoryPages.addLocation")}
                  variant="primary"
                  size="medium"
                  isLoading={submitting}
                />
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </Modal>
  );
};

export default AddLocationModal;
