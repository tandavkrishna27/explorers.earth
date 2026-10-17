import { FC, memo, useContext } from "react";
import { DashboardThemeContext } from "../../contexts/DashboardThemeContext";
import { usePublicCategoryThemeStyles } from "../../features/PublicHome/components/PublicCategoryThemeContext";

interface SwitchButtonProps {
  isChecked?: boolean;
  onChange: () => void;
  variant?: "dark" | "purple" | "green" | "blue";
  disabled?: boolean;
}

// Helper function to safely get theme
const useThemeSafe = (): "light" | "dark" => {
  const context = useContext(DashboardThemeContext);
  if (context) {
    return context.theme;
  }
  // Fallback: check DOM for theme class
  if (typeof document !== "undefined") {
    return document.documentElement.classList.contains("dashboard-theme-dark") ? "dark" : "light";
  }
  return "light";
};

const SwitchButton: FC<SwitchButtonProps> = memo(
  ({ isChecked, onChange, variant = "dark", disabled = false }) => {
    const theme = useThemeSafe();
    const categoryStyles = usePublicCategoryThemeStyles();
    return (
      <label
        className={`relative inline-flex items-center transition-all duration-200 ${
          disabled ? "cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only"
        />
        <div
          style={categoryStyles ? { backgroundColor: isChecked ? 'var(--category-accent)' : 'var(--category-control-border)', opacity: disabled ? .5 : undefined } : undefined}
          className={`w-11 h-6 rounded-full transition-all duration-300 ${
            disabled
              ? "opacity-50 bg-gray-600"
              : variant === "blue"
              ? isChecked
                ? "bg-[var(--dash-accent)] hover:opacity-90"
                : "bg-gray-600"
              : variant === "purple"
              ? isChecked
                ? "bg-[hsl(var(--blue-cta))] hover:opacity-90"
                : "bg-gray-600"
              : variant === "green"
              ? isChecked
                ? theme === "dark"
                  ? "bg-[var(--dash-accent)] hover:opacity-90"
                  : "bg-evergreen hover:opacity-90"
                : "bg-gray-600"
              : variant === "dark"
              ? isChecked
                ? "bg-white hover:opacity-90"
                : "bg-gray-600"
              : "bg-black"
          }`}
        />
        <span
          style={categoryStyles ? { backgroundColor: isChecked ? 'var(--category-accent-ink)' : 'var(--category-panel)' } : undefined}
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-md transition-all duration-300 transform ${
            disabled
              ? "bg-gray-400"
              : variant === "blue"
              ? isChecked
                ? "bg-white translate-x-5"
                : "bg-gray-300 translate-x-0"
              : variant === "purple"
              ? isChecked
                ? "bg-white translate-x-5"
                : "bg-gray-300 translate-x-0"
              : variant === "green"
              ? isChecked
                ? "bg-white translate-x-5"
                : "bg-gray-300 translate-x-0"
              : variant === "dark"
              ? isChecked
                ? "bg-gray-800 translate-x-5"
                : "bg-white translate-x-0"
              : isChecked
              ? "bg-black translate-x-5"
              : "bg-white translate-x-0"
          }`}
        />
      </label>
    );
  }
);

SwitchButton.displayName = "SwitchButton";

export default SwitchButton;
