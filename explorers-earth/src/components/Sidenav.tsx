import React, { useLayoutEffect, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Home from "../assets/icons/Home";
import SettingsIcon from "../assets/icons/SettingsIcon";
import DirectionBoard from "../assets/icons/DirectionBoard";
import Profile from "../assets/icons/Profile";
import Analytics from "../assets/icons/Analytics";

import { useDashboardTheme } from "../contexts/DashboardThemeContext";
import { Tooltip } from "react-tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, gql } from "@apollo/client";
import LogoutIcon from "../assets/icons/LogoutIcon";
import { LogoFull, LogoIcon } from "../assets/icons/EoeLogo";
import useAuthStore from "../store/store";
import { IMAGE_CONFIG } from "../config";
import { useLogout } from "../hooks/useLogout";

const SIDEBAR_ACCOUNT_QUERY = gql`
  query SidebarAccount($documentId: ID!) {
    usersPermissionsUser(documentId: $documentId) {
      accounts {
        documentId
        Account_Name
        profile_picture {
          url
        }
      }
    }
  }
`;

const Sidebar = () => {
  const { t } = useTranslation();
  const { isSidebarOpen: isOpen } = useDashboardTheme();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const handleLogout = useLogout();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const { data: acctData } = useQuery(SIDEBAR_ACCOUNT_QUERY, {
    variables: { documentId: user?.documentId },
    skip: !user?.documentId,
  });
  const avatarUrl =
    acctData?.usersPermissionsUser?.accounts?.[0]?.profile_picture?.url ||
    IMAGE_CONFIG.defaultImages.profile;

  // Close the account popover on any outside click
  useEffect(() => {
    if (!showAccountMenu) return;
    const onDown = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showAccountMenu]);

  // Set CSS variable for sidebar width to help with button positioning
  // Use useLayoutEffect for immediate synchronous execution before paint
  useLayoutEffect(() => {
    const sidebarWidth = isOpen ? '256px' : '64px';
    document.documentElement.style.setProperty('--sidebar-width', sidebarWidth);
    document.body.setAttribute('data-sidebar-open', isOpen.toString());

    return () => {
      document.documentElement.style.removeProperty('--sidebar-width');
      document.body.removeAttribute('data-sidebar-open');
    };
  }, [isOpen]);

  return (
    <div
      className={`dashboard-theme ${isOpen ? "w-64 min-w-[256px]" : "w-16 min-w-[64px]"
        } bg-dashboard-sidebar font-poppins text-dashboard transition-all duration-300 flex flex-col flex-shrink-0 fixed left-2 top-2 bottom-2 z-40 rounded-2xl`}
    >
      {/* Fixed Header - Logo and Toggle Button */}
      <div className={`flex w-full py-2.5 flex-shrink-0 min-h-[56px] ${isOpen ? "items-center justify-start pl-[20px] pr-3 gap-3" : "flex-col items-center justify-center gap-2 px-4"}`}>
        {isOpen ? (
          <LogoFull className="h-7 text-dashboard flex-shrink-0" />
        ) : (
          <LogoIcon className="h-8 text-dashboard flex-shrink-0" />
        )}
      </div>

      {/* Sidebar Menu */}

      <nav className="flex flex-col gap-2 mt-1.5 flex-1 overflow-y-auto scrollbar-hide w-full px-2">
        <SidebarItem
          isOpen={isOpen}
          Icon={Home}
          title={t("sidebar.home")}
          to="/home"
        />

        <SidebarItem
          isOpen={isOpen}
          Icon={Profile}
          title={t("sidebar.profile")}
          to="/profile"
        />
        <SidebarItem
          isOpen={isOpen}
          Icon={DirectionBoard}
          title={"Recommendations"}
          to="/recommendations"
        />
        <SidebarItem
          isOpen={isOpen}
          Icon={Analytics}
          title={t('sidebar.analytics')}
          to="/analytics"
        />
      </nav>

      {/* Footer: Settings, then the account avatar pinned to the bottom */}
      <div className="flex flex-col gap-2 flex-shrink-0 w-full px-2 pb-2">
        <SidebarItem
          isOpen={isOpen}
          Icon={SettingsIcon}
          title={t("sidebar.settings")}
          to="/settings"
        />

        {/* Account avatar + popover (View public profile · Logout) */}
        <div ref={accountMenuRef} className="relative w-full">
          <button
            type="button"
            onClick={() => setShowAccountMenu((v) => !v)}
            {...(!isOpen ? { "data-tooltip-id": "account" } : {})}
            className={`relative flex items-center rounded-lg transition-all w-full hover:bg-dashboard-muted ${isOpen ? "gap-3 px-3 py-2" : "justify-center py-2"
              }`}
          >
            <img
              src={avatarUrl}
              alt="account"
              className="h-8 w-8 rounded-full object-cover border border-dashboard flex-shrink-0"
            />
            {isOpen && (
              <span className="text-sm font-medium text-dashboard truncate max-w-[150px] text-left">
                {user?.username || "Account"}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showAccountMenu && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className={`absolute bottom-full mb-2 bg-dashboard-sidebar rounded-xl shadow-dashboard-elevated border border-dashboard overflow-hidden z-50 ${isOpen ? "left-0 w-full" : "left-full ml-2 w-56"
                  }`}
              >
                <div className="px-4 py-3 bg-dashboard-muted border-b border-dashboard flex items-center gap-3">
                  <img
                    src={avatarUrl}
                    alt="account"
                    className="h-9 w-9 rounded-full object-cover ring-2 ring-white flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-dashboard truncate">
                      {user?.username || "User"}
                    </p>
                    <p className="text-xs text-dashboard-muted">Account</p>
                  </div>
                </div>
                <div className="py-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAccountMenu(false);
                      if (user?.username) navigate(`/${user.username}`);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-dashboard hover:bg-dashboard-muted transition-colors"
                  >
                    <div className="w-5 h-5 flex items-center justify-center">
                      <Profile fill="currentColor" />
                    </div>
                    <span>View public profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAccountMenu(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-dashboard hover:bg-dashboard-muted transition-colors"
                  >
                    <div className="w-5 h-5 flex items-center justify-center">
                      <LogoutIcon size="18" />
                    </div>
                    <span>Logout</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isOpen && createPortal(
            <Tooltip
              id="account"
              place="right"
              style={{ fontSize: "12px", zIndex: 1000 }}
              className="!bg-gray-800 !text-white !border !border-gray-600 !rounded-lg !px-2 !py-1"
            >
              Account
            </Tooltip>,
            document.body
          )}
        </div>
      </div>
    </div>
  );
};

// Sidebar Item Component with Active State and Tooltip
const SidebarItem = ({
  Icon,
  title,
  to,
  isOpen,
  isExternal = false,
}: {
  Icon: React.ComponentType<{ size?: string; fill?: string }>;
  title: string;
  to: string;
  isOpen: boolean;
  isExternal?: boolean;
}) => {
  const location = useLocation();
  const isActive = !isExternal && (
    to === "/recommendations"
      ? (location.pathname === "/recommendations" || location.pathname === "/recommendations/" || location.pathname.startsWith("/recommendations/places"))
      : location.pathname.startsWith(to)
  );

  const handleClick = (e: React.MouseEvent) => {
    if (isExternal) {
      e.preventDefault();
      window.open(to, '_blank');
    }
  };

  if (isExternal) {
    return (
      <a
        href={to}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={`relative flex items-center rounded-lg transition-all dt-interactive ${isOpen ? "gap-4 px-4 py-3 mx-3" : "justify-center py-3 w-full"
          } hover:bg-dashboard-muted`}
        {...(!isOpen ? { "data-tooltip-id": title } : {})}
      >
        <motion.div
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center"
          whileHover={{ scale: 1.3 }}
          transition={{ type: "spring", stiffness: 120 }}
        >
          <Icon fill="currentColor" />
        </motion.div>
        {isOpen && <span className="text-sm font-medium">{title}</span>}
        {!isOpen && createPortal(
          <Tooltip
            style={{
              fontSize: "12px",
              maxWidth: "200px",
              whiteSpace: "nowrap",
              zIndex: 1000
            }}
            id={title}
            place="right"
            className="!bg-gray-800 !text-white !border !border-gray-600 !rounded-lg !px-2 !py-1"
          >
            {title}
          </Tooltip>,
          document.body
        )}
      </a>
    );
  }

  return (
    <Link
      to={to}
      className={`relative flex items-center rounded-lg transition-all dt-interactive w-full ${isOpen ? "gap-4 px-4 py-3" : "justify-center py-3"
        } ${isActive
          ? "bg-dashboard-muted text-dashboard-accent"
          : "hover:bg-dashboard-muted"
        }`}
      {...(!isOpen ? { "data-tooltip-id": title } : {})}
    >
      {/* Icon - Fixed width container */}
      <motion.div
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center"
        whileHover={{ scale: 1.3 }}
        transition={{ type: "spring", stiffness: 120 }}
      >
        <Icon fill="currentColor" />
      </motion.div>
      {/* Text - Truncate if needed, with fixed width when open */}
      {isOpen && (
        <span
          className="text-sm font-medium overflow-hidden text-ellipsis block"
          style={{ maxWidth: "160px" }}
        >
          {title}
        </span>
      )}
      {!isOpen && createPortal(
        <Tooltip
          style={{
            fontSize: "12px",
            maxWidth: "200px",
            whiteSpace: "nowrap",
            zIndex: 1000,
          }}
          id={title}
          place="right"
          className="!bg-gray-800 !text-white !border !border-gray-600 !rounded-lg !px-2 !py-1"
        >
          {title}
        </Tooltip>,
        document.body
      )}
    </Link>
  );
};

export default Sidebar;
