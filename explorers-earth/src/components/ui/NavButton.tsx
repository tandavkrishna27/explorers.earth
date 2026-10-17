import { FC, MouseEvent, ReactElement } from "react";
import { Link } from "react-router-dom";

interface NavButtonProps {
  icon: ReactElement;
  text: string;
  onClickHandler: (event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  isActive: boolean;
  type?: "default" | "public";
  href?: string;
}

const NavButton: FC<NavButtonProps> = ({
  icon,
  text,
  onClickHandler,
  isActive,
  type = "default",
  href,
}) => {
  const className = `
        relative min-h-11 min-w-11 flex-1 flex font-poppins flex-col items-center justify-center gap-0.5
        pt-1.5 pb-1 px-1 rounded-xl transition-all duration-300 ease-in-out
        hover:scale-105 active:scale-95
        ${isActive ? "" : "hover:bg-dashboard-muted/50"}
      `;
  const content = <>
      <div className="transition-transform duration-300">
        {icon}
      </div>

      {/* Tab label */}
      <span
        className={`
          text-[10px] leading-tight font-medium tracking-wide truncate max-w-full transition-all duration-300
          ${isActive ? "text-white" : "text-white/50"}
        `}
      >
        {text}
      </span>
    </>;
  if (type === "public" && href) return <Link to={href} onClick={onClickHandler} aria-current={isActive ? "page" : undefined} className={className}>{content}</Link>;
  return <button onClick={onClickHandler} className={className}>{content}</button>;
};

export default NavButton;
