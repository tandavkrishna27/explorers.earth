import React from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  ariaLabel?: string;
  onColor?: string;
  offColor?: string;
  ariaDescribedBy?: string;
}

const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  loading = false,
  label,
  ariaLabel,
  onColor = "bg-dashboard-accent",
  offColor = "bg-gray-600/80",
  ariaDescribedBy,
}) => {
  const isInteractionDisabled = disabled || loading;
  return (
    <div className={`flex min-h-11 items-center gap-2 ${isInteractionDisabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
      {label && <span className="text-xs font-semibold text-dashboard">{label}</span>}
      <button
        type="button"
        disabled={isInteractionDisabled}
        role="switch"
        aria-checked={checked}
        aria-describedby={ariaDescribedBy}
        onClick={() => onChange(!checked)}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent focus-visible:ring-offset-2 focus-visible:ring-offset-dashboard-bg ${disabled && !loading ? "opacity-50" : ""}`}
        aria-label={ariaLabel || label || "Toggle"}
      >
        <span className={`relative inline-flex h-6 w-11 items-center rounded-full ${checked ? onColor : offColor}`}>
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-md transition-all duration-300 ${
              checked ? "translate-x-6" : "translate-x-1"
            }`}
          >
            {loading && (
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            )}
          </span>
        </span>
      </button>
    </div>
  );
};

export default Switch;
