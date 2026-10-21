import { memo } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../../store/store";
import { keyboardActivation } from "../../utils/keyboardActivation";

const Logo = memo(
  ({
    variant,
    height,
    width,
  }: {
    variant?: string;
    height?: string;
    width?: string;
  }) => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuthStore();
    return (
      <div
        className={` ${variant ? "dark:text-black" : "dark:text-white"
          } relative z-40 text-black cursor-pointer flex flex-row items-center gap-2`}
        {...keyboardActivation(() => (isAuthenticated ? navigate("/home") : navigate("/")))}
      >
        {/* PNG/JPEG logo first */}
        <img
          src="/Explorers.jpg"
          alt="Explorers Logo"
          className="object-contain"
          style={{
            width: width ? `${parseInt(width) * 0.4}px` : "28px",
            height: "auto",
          }}
        />
        {/* SVG logo second */}
        <img
          src="/logo.svg"
          alt="Explorers Logo"
          width={width ? width : "65"}
          height={height ? height : "25"}
          className="object-contain"
          style={{
            width: width || "65px",
            height: height || "25px",
            filter: variant === "dark" ? "none" : "brightness(0) invert(1)",
          }}
        />
      </div>
    );
  }
);

export default Logo;
