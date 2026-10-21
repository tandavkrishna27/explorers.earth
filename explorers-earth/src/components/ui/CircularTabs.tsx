import { motion } from "framer-motion";
import { FC, ReactNode } from "react";
import { keyboardActivation } from "../../utils/keyboardActivation";

interface CircularTab {
  id: string;
  label: string;
  icon: ReactNode;
}

interface CircularTabsProps {
  tabs: CircularTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const CircularTabs: FC<CircularTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
}) => {
  return (
    <div className="flex justify-center items-center gap-2 sm:gap-4 md:gap-6 lg:gap-8 py-4 sm:py-6 md:py-8 px-2 sm:px-4 overflow-x-auto scrollbar-hide">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <div
            key={tab.id}
            className="flex flex-col items-center cursor-pointer group flex-shrink-0"
            {...keyboardActivation(() => onTabChange(tab.id))}
          >
            {/* Circular Icon Container */}
            <motion.div
              className={`
                relative w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full 
                flex items-center justify-center
                transition-all duration-300
                ${
                  isActive
                    ? "bg-gradient-to-br from-dashboard-accent to-purple-600 shadow-xl shadow-dashboard-accent/40 border-2 border-dashboard-accent"
                    : "bg-dashboard-bg border-2 border-dashboard-muted group-hover:border-dashboard-accent/60 group-hover:shadow-lg group-hover:shadow-dashboard-accent/20"
                }
              `}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              animate={{
                scale: isActive ? 1 : 0.95,
              }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              {/* Icon */}
              <motion.div
                className={`
                  transition-all duration-300
                  ${
                    isActive
                      ? "text-white scale-110"
                      : "text-dashboard-light group-hover:text-dashboard-accent"
                  }
                `}
              >
                {tab.icon}
              </motion.div>

              {/* Hover Glow Effect */}
              {!isActive && (
                <div className="absolute inset-0 rounded-full bg-dashboard-accent/0 group-hover:bg-dashboard-accent/10 transition-all duration-300" />
              )}
            </motion.div>

            {/* Label */}
            <motion.p
              className={`
                mt-2 sm:mt-2.5 md:mt-3 text-xs sm:text-sm md:text-base font-poppins font-semibold
                transition-all duration-300 text-center whitespace-nowrap
                ${
                  isActive
                    ? "text-dashboard-accent"
                    : "text-dashboard-light group-hover:text-dashboard"
                }
              `}
            >
              {tab.label}
            </motion.p>

            {/* Active Indicator Dot */}
            {isActive && (
              <div className="mt-0.5 sm:mt-1 w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-dashboard-accent" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CircularTabs;
