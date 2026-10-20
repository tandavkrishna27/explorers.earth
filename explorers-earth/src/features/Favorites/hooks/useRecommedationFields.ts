import * as Yup from "yup";
import { Places } from "../../Profile/types/types";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import type { RecommendedPlaceView } from "../api/placesViewModel";
// Ticket 5.1. The place as the owner view presents it. The Strapi-era types claimed every
// field was populated; a manual place has no provider id or rating, a creator may have
// disclosed no contact details, and an absent coordinate pair stays absent.
interface FetchedPlace {
  recommendedPlace: RecommendedPlaceView;
}
export const useRecommendationFields = ({
  places,
  isCustom,
  fetchedPlace,
  recommendationType = "place",
  instagramLink = null,
  instagramCaption = null,
  personName = null,
}: {
  places?: Places | null;
  isCustom: boolean;
  fetchedPlace?: FetchedPlace;
  recommendationType?: "place" | "person";
  instagramLink?: string | null;
  instagramCaption?: string | null;
  personName?: string | null;
}) => {
  const { t } = useTranslation();

  // inital values for recommended place
  const initialValues = useMemo(() => {
    // For person recommendations, never use places data
    if (recommendationType === "person") {
      return {
        title: personName || "",
        address: "",
        recommendation: instagramLink || "",
        subcategory: "",
        contactName: personName || "",
        contactNumber: "",
        contactVisibility: "private",
        socialLink: instagramLink || "",
        recommendationLink: instagramLink || "",
        reason: instagramCaption || "",
      };
    }

    // For place recommendations, use places data when available
    return {
      title: places?.name || "",
      address: places?.formatted_address || "",
      recommendation: "",
      subcategory: "",
      contactName: "",
      contactNumber: places?.formatted_phone_number || "",
      contactVisibility: "private",
      socialLink: places?.website || "",
      recommendationLink: instagramLink || "",
      reason: instagramCaption || "",
      userRating: null,
      googleRating: (places as any)?.rating ? ((places as any).rating * 2).toFixed(1) : "",
    };
  }, [places, recommendationType, instagramLink, instagramCaption, personName]);

  const editInitialValues = useMemo(() => ({
    title: fetchedPlace?.recommendedPlace?.Place_Details?.Title || "",
    address: fetchedPlace?.recommendedPlace?.Place_Details?.Place_Address || "",
    recommendation: fetchedPlace?.recommendedPlace.person_profile_url || "",
    subcategory: fetchedPlace?.recommendedPlace.placesTaxonomy.subcategory?.id || "",
    category: fetchedPlace?.recommendedPlace.placesTaxonomy.category?.id || "",
    categoryLabel: fetchedPlace?.recommendedPlace.placesTaxonomy.category?.label,
    subcategoryLabel: fetchedPlace?.recommendedPlace.placesTaxonomy.subcategory?.label,
    taxonomyUnavailable: fetchedPlace?.recommendedPlace.placesTaxonomy.selectionUnavailable,
    contactName: fetchedPlace?.recommendedPlace?.Contact_Name || "",
    contactNumber: fetchedPlace?.recommendedPlace?.Contact_Number || "",
    contactVisibility: fetchedPlace?.recommendedPlace?.Contact_Visibility === "public" ? "public" : "private",
    socialLink:
      fetchedPlace?.recommendedPlace?.Places_Website ||
      fetchedPlace?.recommendedPlace?.Places_Social_Link ||
      "",
    lat: fetchedPlace?.recommendedPlace?.Place_Details?.Geometry?.lat,
    lng: fetchedPlace?.recommendedPlace?.Place_Details?.Geometry?.lng,
    recommendationLink: fetchedPlace?.recommendedPlace?.Users_Social_URL || "",
    reason: fetchedPlace?.recommendedPlace?.user_recommendation_note || "",
    userRating: fetchedPlace?.recommendedPlace?.user_rating ?? null,
    googleRating: fetchedPlace?.recommendedPlace?.google_rating
      ? (fetchedPlace.recommendedPlace.google_rating * 2).toFixed(1)
      : (fetchedPlace?.recommendedPlace?.Place_Details?.Rating
        ? (fetchedPlace.recommendedPlace.Place_Details.Rating * 2).toFixed(1)
        : ""),
  }), [fetchedPlace]);

  // validation schema for recommended Place - memoized to update when language changes
  const validationSchema = useMemo(() => Yup.object({
    subcategory: Yup.string(),
    recommendationLink: Yup.string(),
    reason: Yup.string(),
    // A person is shown publicly by name, so a person recommendation needs one.
    contactName: recommendationType === "person"
      ? Yup.string().trim().required(t("dashboard.recommendations.addRecommendationForm.validationMessages.personNameRequired"))
      : Yup.string(),
    // Address is required for places, optional for persons
    address: recommendationType === "place"
      ? Yup.string().required(t("dashboard.recommendations.addRecommendationForm.validationMessages.addressRequired"))
      : Yup.string(),
    // Title is required for places, optional for persons (they use recommendation field instead)
    title: recommendationType === "place"
      ? Yup.string().required(t("dashboard.recommendations.addRecommendationForm.validationMessages.titleRequired"))
      : Yup.string(),
    // Recommendation field (Instagram/LinkedIn) is required for persons
    recommendation: recommendationType === "person"
      ? Yup.string()
        .required(t("dashboard.recommendations.addRecommendationForm.validationMessages.socialUrlRequired"))
        .test('is-valid-social-url', 'Please enter a valid Instagram or LinkedIn URL or username (e.g., instagram.com/username, @username, or linkedin.com/in/username)', (value) => {
          if (!value) return false;

          // Normalize the value
          const normalizedValue = value.trim();

          // Check for full Instagram URL (with or without protocol)
          const instagramUrlPattern = /^(https?:\/\/)?(www\.)?instagram\.com\/[\w.-]+\/?$/i;

          // Check for full LinkedIn URL (with or without protocol)
          const linkedinUrlPattern = /^(https?:\/\/)?(www\.)?linkedin\.com\/(in|company)\/[\w-]+\/?$/i;

          // Accept Instagram usernames starting with @ (convert to URL format)
          const instagramUsernamePattern = /^@([\w](?!.*?\.\.)[\w.]{0,28}[\w])$/;

          // Accept plain usernames (alphanumeric, underscore, dot) for Instagram
          const plainUsernamePattern = /^[\w](?!.*?\.\.)[\w.]{0,28}[\w]$/;

          return instagramUrlPattern.test(normalizedValue) ||
            linkedinUrlPattern.test(normalizedValue) ||
            instagramUsernamePattern.test(normalizedValue) ||
            plainUsernamePattern.test(normalizedValue);
        })
      : Yup.string(),
  }), [t, recommendationType]);

  const formFields = useMemo(() => {
    const commonFields = [
      {
        name: "address",
        label: recommendationType === "person"
          ? "Address"
          : t("dashboard.recommendations.addRecommendationForm.taggableFields.address"),
        type: "text",
        placeholder: recommendationType === "person"
          ? "Enter city or location (e.g., New York, USA)"
          : t("dashboard.recommendations.addRecommendationForm.taggableFieldsPlaceholders.address"),
        isRequired: recommendationType === "place",
      },
      {
        name: "contactNumber",
        label: "Contact Number",
        type: "text",
        placeholder: recommendationType === "person"
          ? "Enter phone number (optional)"
          : t("dashboard.recommendations.addRecommendationForm.taggableFieldsPlaceholders.contactNumber"),
      },
      {
        name: "socialLink",
        label: recommendationType === "person"
          ? "Website/Portfolio Link"
          : t("dashboard.recommendations.addRecommendationForm.taggableFields.socialLink"),
        type: "text",
        placeholder: recommendationType === "person"
          ? "Enter website or portfolio URL (optional)"
          : t("dashboard.recommendations.addRecommendationForm.taggableFieldsPlaceholders.socialLink"),
      },
      {
        name: "recommendationDetails",
        label: t("dashboard.recommendations.addRecommendationForm.accordionSection.heading"),
        type: "custom",
        components: [
          {
            name: "recommendationLink",
            label: t("dashboard.recommendations.addRecommendationForm.accordionSection.recommendationLink.label"),
            type: "text",
            placeholder: t("dashboard.recommendations.addRecommendationForm.accordionSection.recommendationLink.placeholder"),
          },
          {
            name: "reason",
            label: t("dashboard.recommendations.addRecommendationForm.accordionSection.whyRecommend.label"),
            type: "textarea",
            placeholder: t("dashboard.recommendations.addRecommendationForm.accordionSection.whyRecommend.placeholder"),
            as: "textarea",
          },
        ],
      },
      {
        name: "userRating",
        label: "Your Rating",
        type: "rating",
      },
      {
        name: "googleRating",
        label: "Google Rating",
        type: "text",
        placeholder: "e.g. 8.4/10",
      },
    ];

    const recommendationField = isCustom
      ? [
        {
          name: "recommendation",
          label: t("dashboard.recommendations.addRecommendationForm.searchField.label"),
          type: "text",
        },
      ]
      : [];

    // Different fields for place vs person
    if (recommendationType === "person") {
      return [
        ...recommendationField,
        {
          name: "contactName",
          label: t("dashboard.recommendations.addRecommendationForm.taggableFields.personName"),
          type: "text",
          placeholder: t("dashboard.recommendations.addRecommendationForm.taggableFieldsPlaceholders.personName"),
          isRequired: true,
        },
        ...commonFields,
      ];
    } else {
      // Place recommendation fields
      return [
        ...recommendationField,
        {
          name: "title",
          label: t("dashboard.recommendations.addRecommendationForm.taggableFields.title"),
          type: "text",
          placeholder: t("dashboard.recommendations.addRecommendationForm.taggableFieldsPlaceholders.title"),
          isRequired: true,
        },
        ...commonFields,
      ];
    }
  }, [t, isCustom, recommendationType]);

  return { formFields, validationSchema, initialValues, editInitialValues };
};
