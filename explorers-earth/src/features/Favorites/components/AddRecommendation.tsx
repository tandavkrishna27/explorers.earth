import { memo } from "react";
import { useLocation } from "react-router-dom";
import AddPlacePage from "./AddPlacePage";

/**
 * Route shell for adding or editing a place (WP6). Places are always places now: the old
 * Place/Person choice is gone (ADD-09). Keyed by the location so "Save and add another",
 * which navigates to this same page, starts a fresh form.
 */
const AddRecommendation = memo(({ type }: { type?: "edit" | "default" }) => {
  const location = useLocation();
  return <AddPlacePage key={location.key} type={type} />;
});

export default AddRecommendation;
