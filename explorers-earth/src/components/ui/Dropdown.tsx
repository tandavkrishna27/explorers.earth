import { FC, useEffect, useRef, useState, useCallback } from "react";
import { KeyValuePair } from "../../features/Profile/components/ProfileForm";
import { keyboardActivation } from "../../utils/keyboardActivation";

interface DropdownProps {
  initalValue: string;
  options: KeyValuePair[];
  label?: string;
  selectedValue: KeyValuePair;
  handleChange: (option: KeyValuePair) => void;
}

const Dropdown: FC<DropdownProps> = ({
  options,
  initalValue,
  label,
  selectedValue,
  handleChange,
}) => {
  // Initialize query from selectedValue - prioritize selectedValue over initalValue
  const getInitialQuery = () => {
    if (selectedValue?.Category_Name) {
      return selectedValue.Category_Name;
    }
    if (selectedValue?.documentId) {
      // If we have documentId but no Category_Name, try to find it in options
      const foundOption = options.find(opt => opt.documentId === selectedValue.documentId);
      if (foundOption?.Category_Name) {
        return foundOption.Category_Name;
      }
    }
    return initalValue || "";
  };

  const [query, setQuery] = useState(getInitialQuery());
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update query from selectedValue when it changes - FORCE update
  useEffect(() => {
    const newQuery = getInitialQuery();
    setQuery(newQuery);
    console.log('Dropdown query updated to:', newQuery, 'from selectedValue:', selectedValue);
  }, [selectedValue?.Category_Name, selectedValue?.documentId, options, initalValue]);

  useEffect(() => {
    const toggle = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      } else {
        setIsOpen(true);
      }
    };
    document.addEventListener("click", toggle);
    return () => document.removeEventListener("click", toggle);
  }, []);

  // Handle selection from the dropdown
  const handleSelect = useCallback(
    (option: KeyValuePair) => {
      handleChange(option);
      setQuery(option.Category_Name); // Update query to the selected value
      setIsOpen(false);
    },
    [handleChange]
  );

  // Filter options based on the query
  const filterOptions = (options || []).filter((option) =>
    String(option.Category_Name).toLowerCase().includes(query.toLowerCase())
  );

  // If filter produces no results but we have options, show all options
  // This handles cases where auto-filled values (e.g., Google Places types) don't match category names
  const displayOptions = filterOptions.length > 0 ? filterOptions : (options || []);
  const showingAllFallback = filterOptions.length === 0 && (options || []).length > 0 && query.length > 0;

  return (
    <div className="relative w-full">
      <div className="mt-1 relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClick={() => {
            if (!isOpen) {
              // Clear query when opening so all options are visible
              setQuery("");
            }
            setIsOpen((prev) => !prev);
          }}
          onBlur={() => {
            // Restore the display value if user didn't select anything
            if (!query) {
              const restored = getInitialQuery();
              if (restored) setQuery(restored);
            }
          }}
          className="block w-full pl-3 pr-10 py-2 border border-dashboard rounded-md shadow-sm outline-none focus:ring-2 hover:ring-1 text-sm hover:ring-dashboard-accent font-poppins placeholder:text-dashboard-muted focus:ring-dashboard-accent bg-dashboard-muted text-dashboard"
          placeholder={`Search ${label}`}
        />
        <div
          className="absolute inset-y-0 right-0 flex items-center px-2 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            if (!isOpen) {
              setQuery(""); // Clear query when opening via chevron too
            }
            setIsOpen((prev) => !prev);
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 text-dashboard-light transform ${isOpen ? "rotate-180" : ""
              }`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-10 modal-scroll w-full mt-1 max-h-52 overflow-y-auto bg-dashboard-sidebar border border-dashboard rounded-md shadow-dashboard-elevated">
          {displayOptions.length === 0 ? (
            <div className="px-4 py-2 font-poppins text-sm text-dashboard-accent">
              No Categories found
            </div>
          ) : (
            <>
              {showingAllFallback && (
                <div className="px-4 py-1.5 font-poppins text-[0.65rem] text-dashboard-light italic border-b border-dashboard">
                  No matches for "{query}" — showing all categories
                </div>
              )}
              {displayOptions.map((option, index) => (
                <div
                  key={`${option.Category_Name}-${index}`}
                  className={`cursor-pointer select-none relative px-4 py-2 text-dashboard hover:rounded-sm hover:bg-dashboard-accent hover:text-dashboard font-poppins text-sm ${option.Category_Name === selectedValue?.Category_Name
                      ? "bg-dashboard-accent text-dashboard font-poppins text-sm"
                      : ""
                    }`}
                  {...keyboardActivation(() => handleSelect(option))}
                >
                  <span className="text-sm font-poppins">
                    {option.Category_Name}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Dropdown;
