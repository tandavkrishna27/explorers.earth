import { memo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Home from "../assets/icons/Home";
import Profile from "../assets/icons/Profile";
import SettingsIcon from "../assets/icons/SettingsIcon";
import MusicNote from "../assets/icons/MusicNote";
import NavButton from "./ui/NavButton";
import Analytics from "../assets/icons/Analytics";
import TravelGuideIcon from "../assets/icons/TravelGuideIcon";
import Heart from "../assets/icons/Heart";

const navItems = [
  { id: "home", icon: Home, text: "Home", path: "/home" },
  {
    id: "profile",
    icon: Profile,
    text: "Profile",
    path: "/profile",
  },
  {
    id: "recommendations",
    icon: Heart,
    // Recommendations hub spans ALL categories, not just Places — labeled
    // "Recommendations", routed straight to /recommendations (the hub).
    text: "Recommendations",
    path: "/recommendations",
  },
  {
    id: "analytics",
    icon: Analytics,
    text: "Analytics",
    path: "/analytics",
  },
  {
    id: "settings",
    icon: SettingsIcon,
    text: "Settings",
    path: "/settings",
  },
];

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Helper function to normalize paths by removing trailing slashes
  const normalizePath = (path: string) => {
    return path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
  };

  // Helper function to check if paths match (ignoring trailing slashes)
  const isPathMatch = (currentPath: string, targetPath: string, itemId: string) => {
    if (itemId === "recommendations") {
      return currentPath.startsWith("/hub") || currentPath.startsWith("/recommendations");
    }
    const normalizedCurrent = normalizePath(currentPath);
    const normalizedTarget = normalizePath(targetPath);
    return normalizedCurrent === normalizedTarget;
  };

  // Helper function to render Home icon with active color
  const renderHomeIcon = (isActive: boolean) => {
    return (
      <svg
        width="26"
        height="22"
        viewBox="0 0 26 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M10.5 22V14.5H15.5V22H21.75V12H25.5L13 0.75L0.5 12H4.25V22H10.5Z"
          fill={isActive ? "var(--dash-accent)" : "var(--dash-text-muted)"}
        />
      </svg>
    );
  };

  // Navigation items for the bottom navigation bar
  const allNavItems = navItems;

  return (
    <div className="fixed bottom-0 left-0 right-0 md:bottom-2 md:left-1/2 md:-translate-x-1/2 md:rounded-lg z-50 w-full md:w-[450px] bg-dashboard-sidebar backdrop-blur-lg text-dashboard flex md:flex-row md:justify-center md:items-center justify-center py-2 px-2 md:p-1 shadow-lg border-t md:border-t-0 border-dashboard/50">
      <div className="flex flex-row justify-between gap-1 w-full max-w-md mx-auto">
        {allNavItems.map((item) => {
          const isActive = !(item as any).isExternal && isPathMatch(location.pathname, item.path, item.id);

          let iconElement;
          if (item.id === "home") {
            iconElement = renderHomeIcon(isActive);
          } else if (item.id === "recommendations") {
            iconElement = (
              <Heart
                fill={isActive ? "var(--dash-accent)" : "var(--dash-text-muted)"}
              />
            );
          } else if (item.id === "analytics") {
            iconElement = (
              <Analytics fill={isActive ? "var(--dash-accent)" : "var(--dash-text-muted)"} />
            );
          } else if (item.id === "guides") {
            iconElement = (
              <TravelGuideIcon
                fill={isActive ? "var(--dash-accent)" : "var(--dash-text-muted)"}
              />
            );
          } else if (item.id === "profile") {
            iconElement = (
              <Profile fill={isActive ? "var(--dash-accent)" : "var(--dash-text-muted)"} />
            );
          } else if (item.id === "settings") {
            iconElement = <SettingsIcon fill={isActive ? "var(--dash-accent)" : "var(--dash-text-muted)"} />;
          } else if (item.id === "music") {
            iconElement = <MusicNote fill={isActive ? "var(--dash-accent)" : "var(--dash-text-muted)"} />;
          }

          const handleClick = () => {
            if ((item as any).isExternal) {
              window.open(item.path, '_blank');
            } else {
              navigate(item.path);
            }
          };

          return (
            <NavButton
              key={item.id}
              icon={iconElement!}
              text={item.text}
              isActive={isActive}
              onClickHandler={handleClick}
              type="public"
            />
          );
        })}
      </div>
    </div>
  );
};

export default memo(Navbar);
