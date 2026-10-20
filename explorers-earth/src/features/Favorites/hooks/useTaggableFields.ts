import { useState, useEffect } from "react";
import { Places } from "../../Profile/types/types";

export const useTaggableFields = ({
  type,
  places,
  recommendationType = "place"
}: {
  type?: string;
  places?: Places | null;
  recommendationType?: "place" | "person";
}) => {
  const [activeFields, setActiveFields] = useState<string[]>([
    "recommendationDetails",
    "recommendation",
    ...(recommendationType === "place" ? ["userRating", "googleRating"] : []),
    // A person's name is required, so its field is always shown rather than tag-in.
    ...(recommendationType === "person" && type !== "edit" ? ["contactName"] : []),
    ...(type === "edit"
      ? [
        "title",
        "contactNumber",
        "category",
        "socialLink",
        "address",
        "subcategory",
        "contactName",
      ]
      : []),
  ]);

  // Define taggable fields based on recommendation type
  const taggableFields = recommendationType === "person"
    ? [
      // The person's name is required and always shown, so it is not a tag.
      "address",
      "contactNumber",
      "socialLink",
      // "subcategory" removed - it's always visible for person type
    ]
    : [
      "title",        // Place name
      "contactNumber",
      "category",
      "socialLink",
      "address",
      "subcategory",
    ];

  // Effect to reset activeFields when recommendation type changes (only in non-edit mode)
  useEffect(() => {
    if (type !== "edit") {
      // For person type, always include subcategory in activeFields
      // For place type, reset to base fields including ratings
      setActiveFields([
        "recommendationDetails",
        "recommendation",
        ...(recommendationType === "person" ? ["subcategory", "contactName"] : ["userRating", "googleRating"]),
      ]);
    }
  }, [recommendationType, type]);

  // Effect to automatically add category field when a place is selected
  useEffect(() => {
    if (places && !activeFields.includes("subcategory")) {
      setActiveFields(prev => [...prev, "subcategory"]);
    }
  }, [places, activeFields]);

  // handle selecting the tags
  const handleTagClick = (fieldName: string) => {
    setActiveFields((prev) =>
      prev.includes(fieldName) ? prev : [...prev, fieldName]
    );
  };

  // logic for remobving the tags
  const handleRemoveTag = (fieldName: string) => {
    setActiveFields((prev) => prev.filter((field) => field !== fieldName));
  };

  return { taggableFields, handleTagClick, handleRemoveTag, activeFields };
};
