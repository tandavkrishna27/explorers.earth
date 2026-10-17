import { FC, memo, ReactNode, ButtonHTMLAttributes } from "react";
import { usePublicCategoryThemeStyles } from "../../features/PublicHome/components/PublicCategoryThemeContext";

// Inline spinner component for button loading states
const ButtonSpinner: FC<{ size?: string }> = ({ size = "small" }) => {
    const dimension = size === "xsmall" ? 12 : size === "small" ? 16 : size === "large" ? 22 : 18;
    return (
        <svg
            className="btn-spinner"
            width={dimension}
            height={dimension}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
                animation: 'btn-spin 0.75s linear infinite',
                flexShrink: 0,
            }}
        >
            <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.25"
            />
            <path
                d="M12 2a10 10 0 0 1 10 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
            />
        </svg>
    );
};

// extend props
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    type?: "button" | "submit" | "reset";
    variant?:
    | "primary"
    | "secondary"
    | "gradient"
    | "tag"
    | "menu"
    | "success"
    | "icon"
    | "ghost"
    | "google"
    | "danger"
    | "redText"
    | "black"
    | "tagSelected"
    | "whiteText"
    | "circle"
    | "purpleText"
    | "green"
    | "dashAccent";
    size?: "none" | "xsmall" | "small" | "medium" | "large";
    onClickHandler?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
    btnText?: string;
    startIcon?: ReactNode;
    endIcon?: ReactNode;
    fullWidth?: boolean;
    isLoading?: boolean;
}

const Button: FC<ButtonProps> = memo(
    ({
        startIcon,
        disabled,
        endIcon,
        size = "medium",
        type = "button",
        variant = "primary",
        onClickHandler,
        btnText,
        fullWidth = false,
        isLoading = false,
        ...rest // 🔥 catch all other props (like data-tooltip-id)
    }) => {
        const categoryStyles = usePublicCategoryThemeStyles();
        const categoryVariant = categoryStyles && ['primary', 'secondary', 'black', 'tag', 'tagSelected', 'ghost', 'icon', 'whiteText', 'purpleText', 'dashAccent', 'menu'].includes(variant);
        const categoryFilled = ['primary', 'tagSelected', 'black'].includes(variant);
        const inDashboard =
            typeof document !== "undefined" &&
            (document.querySelector(".white-theme") ||
                document.querySelector(".dashboard-theme"));

        // Map variants when inside dashboard theme
        const mappedVariant = (() => {
            if (!inDashboard) return variant;
            switch (variant) {
                case "primary":
                    return "dashPrimary";
                case "secondary":
                    return "dashSecondary";
                case "ghost":
                    return "dashGhost";
                case "icon":
                    return "dashIcon";
                case "redText":
                    return "dashDanger";
                default:
                    return variant;
            }
        })();

        // Use mappedVariant for styling
        const effectiveVariant = mappedVariant;

        // Extract className from rest to merge it properly
        const { className: restClassName, style: restStyle, ...restProps } = rest;

        return (
            <button
                type={type}
                onClick={onClickHandler}
                disabled={disabled || isLoading || false}
                data-button-component="true"
                {...restProps} // 🔥 spread rest props here (without className and style)!
                style={{
                    // Override global transition to prevent background from fading
                    // Only transition specific properties, not all properties
                    transition: 'transform 0.3s ease, opacity 0.3s ease, box-shadow 0.3s ease, background-color 0.2s ease',
                    ...restStyle
                }}
                className={`flex flex-row gap-2 items-center rounded-md focus:outline-none font-poppins ${(disabled || isLoading) ? "cursor-not-allowed opacity-50" : ""
                    } ${fullWidth ? "w-full" : ""}
        ${categoryVariant
                        ? `${categoryFilled ? "bg-[var(--category-accent)] text-[var(--category-accent-ink)] hover:opacity-90" : "bg-[var(--category-panel)] text-[var(--category-text)] hover:bg-[var(--category-hover)] shadow-[inset_0_0_0_1px_var(--category-control-border)]"} ${variant === 'tagSelected' ? 'border-2 border-[var(--category-accent)] rounded-2xl' : variant === 'tag' ? 'rounded-2xl' : ''} ${['whiteText', 'purpleText', 'dashAccent', 'dashSecondary'].includes(effectiveVariant) ? 'border border-[var(--category-control-border)]' : ''} ${effectiveVariant === 'dashIcon' ? 'p-2' : variant === 'icon' || variant === 'menu' ? '' : 'px-4 py-2'} ${variant === 'menu' ? 'rounded-full' : ''} justify-center transition-colors duration-200 focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-[var(--category-focus)]`
                        : effectiveVariant === "dashPrimary"
                        ? "dt-button-text bg-dashboard-accent text-white justify-center px-4 py-2 hover:brightness-110"
                        : effectiveVariant === "dashGhost"
                            ? "dt-button-text text-dashboard-accent hover:bg-dashboard-muted/40 px-4 py-2 justify-center"
                            : effectiveVariant === "dashIcon"
                                ? "text-dashboard-accent hover:bg-dashboard-muted/40 p-2 rounded-md"
                                : effectiveVariant === "dashDanger"
                                    ? "dt-button-text text-dashboard-danger hover:text-dashboard-danger px-4 py-2 justify-center"
                                    : effectiveVariant === "primary"
                                        ? "bg-[hsl(var(--blue-cta))] justify-center text-white px-4 py-2 hover:bg-[hsl(var(--blue-final))] transition-colors duration-200"
                                        : effectiveVariant === "secondary"
                                            ? "bg-white justify-center text-[hsl(var(--charcoal))] hover:bg-[hsl(var(--light-gray))] px-4 py-2 transition-colors duration-200"
                                            : effectiveVariant === "black"
                                                ? "bg-[hsl(var(--charcoal))] text-white hover:bg-[hsl(var(--deep-charcoal))] px-4 py-2 transition-colors duration-200"
                                                : effectiveVariant === "tag"
                                                    ? "text-[hsl(var(--charcoal))] bg-white hover:bg-[hsl(var(--light-gray))] rounded-2xl px-4 py-2 transition-colors duration-200"
                                                    : effectiveVariant === "tagSelected"
                                                        ? "text-white border-[hsl(var(--blue-cta))] border-2 bg-[hsl(var(--blue-cta))] hover:bg-[hsl(var(--blue-final))] rounded-2xl px-4 py-2 transition-colors duration-200"
                                                        : effectiveVariant === "gradient"
                                                            ? "text-white bg-gradient-to-r from-[hsl(var(--blue-cta))] via-[hsl(var(--blue-final))] px-4 py-2 to-[hsl(var(--blue-final))]"
                                                            : effectiveVariant === "google"
                                                                ? "bg-white text-[hsl(var(--charcoal))] flex items-center justify-center font-medium px-4 py-2 hover:bg-[hsl(var(--light-gray))] transition-colors duration-200"
                                                                : effectiveVariant === "danger"
                                                                    ? "bg-[hsl(var(--destructive))] text-white flex items-center justify-center font-medium hover:bg-[hsl(var(--destructive))]/90 px-4 py-2 transition-colors duration-200"
                                                                    : effectiveVariant === "success"
                                                                        ? "flex items-center text-sm rounded-none text-[hsl(var(--evergreen))] px-4 py-2 hover:text-[hsl(var(--light-evergreen))] justify-center font-medium"
                                                                        : effectiveVariant === "circle"
                                                                            ? "bg-[hsl(var(--destructive))] text-white flex items-center justify-center font-medium hover:bg-[hsl(var(--destructive))]/90 px-4 py-2 transition-colors duration-200"
                                                                            : effectiveVariant === "ghost"
                                                                                ? "flex items-center text-[hsl(var(--charcoal))] justify-center font-medium px-4 py-2"
                                                                                : effectiveVariant === "icon"
                                                                                    ? "flex items-center text-white justify-center font-medium"
                                                                                    : effectiveVariant === "purpleText"
                                                                                        ? "flex items-center text-sm border border-[hsl(var(--blue-cta))] px-4 py-2 hover:border-[hsl(var(--blue-final))] text-[hsl(var(--blue-cta))] hover:text-[hsl(var(--blue-final))] justify-center font-medium transition-colors duration-200"
                                                                                        : effectiveVariant === "whiteText"
                                                                                            ? "flex items-center text-sm border border-white px-4 py-2 hover:border-[hsl(var(--text-light))] text-white hover:text-[hsl(var(--text-light))] justify-center font-medium transition-colors duration-200"
                                                                                            : effectiveVariant === "redText"
                                                                                                ? "flex items-center text-sm rounded-none text-[hsl(var(--destructive))] px-4 py-2 hover:text-[hsl(var(--destructive))]/80 justify-center font-medium transition-colors duration-200"
                                                                                                : effectiveVariant === "menu"
                                                                                                    ? "bg-white rounded-full flex items-center justify-center font-medium"
                                                                                                    : effectiveVariant === "green"
                                                                                                        ? "bg-transparent border border-[hsl(142,65%,45%)] text-[hsl(142,65%,45%)] justify-center px-4 py-2 hover:bg-[hsl(142,65%,45%)] hover:text-white transition-colors duration-200"
                                                                                                        : effectiveVariant === "dashAccent"
                                                                                                            ? "bg-transparent border border-[var(--dash-accent)] text-[var(--dash-accent)] justify-center px-4 py-2 hover:bg-[var(--dash-accent)] hover:text-white transition-colors duration-200"
                                                                                                            : effectiveVariant === "dashSecondary"
                                                                                                                ? "bg-dashboard-sidebar border border-dashboard justify-center text-dashboard px-4 py-2 hover:bg-dashboard-card hover:border-dashboard-accent/50"
                                                                                                                : ""
                    }
        ${size === "small"
                        ? "text-sm px-3 py-1.5"
                        : size === "medium"
                            ? "text-md px-4 py-2"
                            : size === "none"
                                ? ""
                                : size === "xsmall"
                                    ? "text-xs px-3 py-2"
                                    : "text-lg px-6 py-3"
                    } ${restClassName || ""}`}
            >
                {isLoading ? (
                    <>
                        <ButtonSpinner size={size} />
                        {btnText && <span>{btnText}</span>}
                    </>
                ) : (
                    <>
                        {startIcon && startIcon} {btnText} {endIcon && endIcon}
                    </>
                )}
            </button>
        );
    }
);

export default Button;
