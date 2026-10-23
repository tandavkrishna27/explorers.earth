import { selectedCity } from "../../../pages/Favorites";
import { KeyValuePair } from "../formValues";
import * as Yup from "yup";
import { useTranslation } from "react-i18next";

interface useFormFieldsProps {
  isEditing: boolean;
  selectedCity: selectedCity | null;
}
export const useFormFields = ({
  isEditing,
  selectedCity,
}: useFormFieldsProps) => {
  const { t } = useTranslation();

  const locationInitialValues: KeyValuePair = isEditing
    ? {
        listName: selectedCity?.List_Name || "",
        recommendationSocialLink: selectedCity?.Instagram_Media_URL || "",
        note: selectedCity?.List_Name_Details?.note || "",
        placeUrl: selectedCity?.slug || "",
      }
    : {
        listName: "",
        recommendationSocialLink: "",
        note: "",
        placeUrl: "",
      };

  const locationValidationSchema = Yup.object({
    listName: Yup.string().required("List Name is Required"),
    recommendationSocialLink: Yup.string(),
    note: Yup.string(),
    placeUrl: Yup.string().required("Url name is Required"),
  });

  const locationFields = [
    {
      name: "listName",
      label: t("dashboard.recommendations.locationForm.labels.searchLocation"),
      placeholder: t("dashboard.recommendations.locationForm.placeholders.searchLocation"),
      type: "text",
    },
    {
      name: "recommendationSocialLink",
      label: t("dashboard.recommendations.locationForm.labels.recommendationSocialLink"),
      placeholder: t("dashboard.recommendations.locationForm.placeholders.recommendationSocialLink"),
      type: "text",
    },
    {
      name: "note",
      label: t("dashboard.recommendations.locationForm.labels.note"),
      placeholder: t("dashboard.recommendations.locationForm.placeholders.note"),
      type: "text",
    },
    {
      name: "placeUrl",
      label: t("dashboard.recommendations.locationForm.labels.placeUrl"),
      placeholder: t("dashboard.recommendations.locationForm.placeholders.placeUrl"),
      type: "text",
    },
  ];
  return { locationFields, locationInitialValues, locationValidationSchema };
};
