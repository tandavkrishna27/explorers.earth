import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Field, ErrorMessage } from "formik";
import { AddIcon } from "../../../assets/icons/AddIcon";
import CrossIcon from "../../../assets/icons/CrossIcon";
import AddressInput from "./AddressInput";
import { keyboardActivation } from "../../../utils/keyboardActivation";
// toast not needed here anymore

interface BusinessLocationFieldsProps {
  values: any;
  setFieldValue: (field: string, value: any) => void;
  onFieldChange?: () => void; // Callback to notify parent about field changes
}

// Removed GoogleMedia and CustomSearchImage here; feed import will handle media in FeedFields

// Media fetching removed from here; handled in FeedFields via Import from Google

const BusinessLocationFields: React.FC<BusinessLocationFieldsProps> = ({
  values,
  setFieldValue,
  onFieldChange,
}) => {
  const { t } = useTranslation();
  
  // Taggable fields for business location
  const businessLocationFields = [
    { name: "title", label: t('dashboard.profile.publicProfile.fields.title') },
    { name: "businessContact", label: t('dashboard.profile.publicProfile.fields.contact') },
    { name: "businessWebsite", label: t('dashboard.profile.publicProfile.fields.website') },
    { name: "about", label: t('dashboard.profile.publicProfile.fields.about') },
  ];
  const [activeFields, setActiveFields] = useState<string[]>([]);

  // Initialize active fields based on existing values
  useEffect(() => {
    const fieldsWithValues = businessLocationFields
      .filter((field) => values[field.name] && values[field.name].trim() !== "")
      .map((field) => field.name);

    setActiveFields(fieldsWithValues);
  }, [values]);

  // No image initialization here; feed is managed separately in FeedFields

  // No Google media fetching here; handled by FeedFields using saved place id

  // File/image handling removed from this section; managed in FeedFields

  // Handle tag click
  const handleTagClick = (fieldName: string) => {
    setActiveFields((prev) =>
      prev.includes(fieldName) ? prev : [...prev, fieldName]
    );
  };

  // Handle tag removal
  const handleRemoveTag = (fieldName: string) => {
    setActiveFields((prev) => prev.filter((field) => field !== fieldName));
    // Note: We don't clear the field value to allow collapsing/expanding while preserving data
  };

  return (
    <div className="space-y-4">
      {/* Google Places Search */}
      <div className="space-y-2">
        <label className="block text-xs text-white mb-1">
          {t('dashboard.profile.publicProfile.fields.addLocation')}
        </label>
        <AddressInput
          type="address"
          label={t('dashboard.profile.publicProfile.fields.addLocation')}
          value={values.businessAddress || ""}
          onChange={(value) => {
            setFieldValue("businessAddress", value);
          }}
          setPlaces={(place) => {
            // Clear all business fields first to ensure fresh data
            setFieldValue("title", place.name || "");
            setFieldValue("businessAddress", place.formatted_address || "");

            // Always set contact and website fields - either with new data or empty to clear previous
            setFieldValue(
              "businessContact",
              place.formatted_phone_number || ""
            );
            setFieldValue("businessWebsite", place.website || "");

            // Clear business description as it's not provided by Google API
            setFieldValue("about", "");

            // Save place_id for Feed import functionality
            setFieldValue("businessPlaceId", place.place_id || "");

            // Add fields to active fields if they have values
            const fieldsToAdd: string[] = [];
            if (place.name && place.name.trim() !== "") {
              fieldsToAdd.push("title");
            }
            if (
              place.formatted_phone_number &&
              place.formatted_phone_number.trim() !== ""
            ) {
              fieldsToAdd.push("businessContact");
            }
            if (place.website && place.website.trim() !== "") {
              fieldsToAdd.push("businessWebsite");
            }
            setActiveFields((prev) => {
              // Remove all business-related fields first
              const nonBusinessFields = prev.filter(
                (f) =>
                  ![
                    "title",
                    "businessContact",
                    "businessWebsite",
                    "about",
                  ].includes(f)
              );
              // Add back only fields that have values
              const newActiveFields = [...nonBusinessFields, ...fieldsToAdd];
              return newActiveFields;
            });

            // Note: We no longer auto-fetch images here
          }}
          placeHolder={t('dashboard.profile.publicProfile.fields.searchAddress')}
        />
      </div>

      {/* Taggable Fields */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2">
          <label className="block text-xs text-white mb-1">
            {t('dashboard.profile.publicProfile.fields.addLocationInformation')}
          </label>
          <div className="flex flex-wrap gap-2">
            {businessLocationFields.map((field) => (
              <button
                key={field.name}
                className={`px-4 flex flex-row items-center gap-2 relative py-2 font-poppins text-xs rounded-md min-w-max ${
                  activeFields.includes(field.name)
                    ? "bg-dashboard-sidebar text-dashboard border-2 border-dashboard-accent"
                    : "bg-dashboard-muted text-dashboard"
                }`}
                type="button"
                onClick={() => handleTagClick(field.name)}
              >
                {field.label}
                {activeFields.includes(field.name) ? (
                  <span
                    className="absolute -right-1 bg-white -top-1 rounded-full text-sm cursor-pointer text-[hsl(var(--blue-cta))]"
                    {...keyboardActivation((e) => {
                      e.stopPropagation();
                      handleRemoveTag(field.name);
                    })}
                  >
                    <CrossIcon size="4" stroke="hsl(var(--blue-cta))" />
                  </span>
                ) : (
                  <AddIcon size="5" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Active Field Inputs */}
        {activeFields.map((fieldName) => {
          const field = businessLocationFields.find(
            (f) => f.name === fieldName
          );
          if (!field) return null;

          return (
            <div key={fieldName} className="space-y-1">
              <label className="block text-xs text-white">{field.label}</label>
              {fieldName === "about" ? (
                <Field
                  as="textarea"
                  name={fieldName}
                  className="w-full placeholder:text-dashboard-muted outline-none p-3 border border-dashboard bg-dashboard-muted font-poppins rounded-md text-sm text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent hover:border-dashboard-accent focus:bg-dashboard-muted"
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                  rows={3}
                  onChange={(e: any) => {
                    setFieldValue(fieldName, e.target.value);
                    if (onFieldChange) {
                      onFieldChange();
                    }
                  }}
                />
              ) : (
                <Field
                  name={fieldName}
                  type={fieldName === "businessWebsite" ? "url" : "text"}
                  className="w-full placeholder:text-dashboard-muted outline-none p-3 border border-dashboard bg-dashboard-muted font-poppins rounded-md text-sm text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent hover:border-dashboard-accent focus:bg-dashboard-muted"
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                  onChange={(e: any) => {
                    setFieldValue(fieldName, e.target.value);
                    if (onFieldChange) {
                      onFieldChange();
                    }
                  }}
                />
              )}
              <ErrorMessage
                name={fieldName}
                component="div"
                className="text-red-500 text-xs"
              />
            </div>
          );
        })}
      </div>

      {/* Image management removed from Business Location; use the Feed section */}
    </div>
  );
};

export default BusinessLocationFields;
