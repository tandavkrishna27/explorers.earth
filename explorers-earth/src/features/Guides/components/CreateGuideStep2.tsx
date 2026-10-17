import { useState, useEffect, useMemo, useRef } from "react";
import Button from "../../../components/ui/Button";
import { useGuidesOwner } from "../hooks/useGuidesOwner";

// Stable identities for the array defaults. A default parameter creates a fresh array on
// every render, and the sync effect below lists these in its dependencies - so with the
// defaults inline, every render saw "new" deps, re-ran the effect, set state, and rendered
// again. Mounting survived it; the first interaction did not.
const NO_CATEGORIES: string[] = [];
const NO_MONTHS: string[] = [];

interface CreateGuideStep2Props {
  initialNumberOfDays?: number | null;
  initialCategories?: string[];
  initialBestTimeToVisit?: string[];
  initialBudgetType?: string | null;
  onBack: () => void;
  onNext: (data: {
    numberOfDays: number | null;
    categories: string[];
    bestTimeToVisit: string[];
    budgetType: string | null;
  }) => void;
}

const CreateGuideStep2: React.FC<CreateGuideStep2Props> = ({
  initialNumberOfDays = null,
  initialCategories = NO_CATEGORIES,
  initialBestTimeToVisit = NO_MONTHS,
  initialBudgetType = null,
  onBack,
  onNext,
}) => {
  // Number of days state
  const [numberOfDays, setNumberOfDays] = useState<number | null>(initialNumberOfDays);
  const [customDays, setCustomDays] = useState<string>("");
  const [isCustomDays, setIsCustomDays] = useState(false);

  // Categories state
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initialCategories);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Best time to visit state (months)
  const [selectedMonths, setSelectedMonths] = useState<string[]>(initialBestTimeToVisit);
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const [monthSearchQuery, setMonthSearchQuery] = useState("");
  const monthDropdownRef = useRef<HTMLDivElement>(null);

  // Budget type state
  const [budgetType, setBudgetType] = useState<string | null>(initialBudgetType);
  const [isBudgetDropdownOpen, setIsBudgetDropdownOpen] = useState(false);
  const budgetDropdownRef = useRef<HTMLDivElement>(null);

  // Ticket 5.3 / decision D9. The category picker's suggestions.
  //
  // This read a Strapi `guideCategories` collection. The canonical contract already decided
  // the storage - `guide_collection_details.categories` is an array of free strings, max 24,
  // 100 characters each - so that collection was never data integrity, only a list to pick
  // from. There is no canonical taxonomy table, and inventing a vocabulary of category
  // names is product copy, not an engineering choice.
  //
  // So the suggestions come from what this creator has already used, and the field accepts
  // anything typed. That invents no vocabulary, keeps "select at least 4" satisfiable on a
  // first guide, matches the storage exactly, and forecloses nothing - a curated list can be
  // layered on top later without changing what is stored.
  //
  // Why it could not simply be dropped: the field is required and had no free-text entry, so
  // an empty list rendered "No categories available" with no way to continue. At retirement
  // that would have made guide creation impossible rather than merely worse.
  const ownedGuides = useGuidesOwner();
  const categoriesLoading = ownedGuides.loading;

  const [error, setError] = useState("");

  // Month names
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Budget type options (matching Strapi enum values)
  // Map display labels to enum values
  const budgetTypeOptions = [
    { label: "Budget", value: "Budget" },
    { label: "Mid-Range", value: "Mid_Range" },
    { label: "Luxury", value: "Luxury" },
    { label: "Backpacker", value: "Backpacker" },
    { label: "Ultra-Luxury", value: "Ultra_Luxury" }
  ];

  // Helper to get display label from enum value
  const getBudgetTypeLabel = (value: string | null) => {
    if (!value) return "";
    const option = budgetTypeOptions.find(opt => opt.value === value);
    return option ? option.label : value;
  };

  // Sync state with initial props
  useEffect(() => {
    setNumberOfDays(initialNumberOfDays);
    setSelectedCategories(initialCategories);
    setSelectedMonths(initialBestTimeToVisit);
    setBudgetType(initialBudgetType);
    if (initialNumberOfDays && ![3, 5, 7].includes(initialNumberOfDays)) {
      setIsCustomDays(true);
      setCustomDays(initialNumberOfDays.toString());
    }
  }, [initialNumberOfDays, initialCategories, initialBestTimeToVisit, initialBudgetType]);

  // Every distinct category this creator has used, in a stable order so the list does not
  // reshuffle between renders.
  const availableCategories = useMemo(() => {
    const seen = new Set<string>();
    for (const guide of ownedGuides.guides ?? [])
      for (const category of ((guide as {Category?: unknown}).Category as unknown[] ?? []))
        if (typeof category === "string" && category.trim()) seen.add(category.trim());
    return [...seen].sort((left, right) => left.localeCompare(right));
  }, [ownedGuides.guides]);

  // Filter categories based on search query and exclude already selected ones
  const filteredCategories = availableCategories.filter((category: string) => {
    const matchesSearch = category.toLowerCase().includes(categorySearchQuery.toLowerCase());
    const notSelected = !selectedCategories.includes(category);
    return matchesSearch && notSelected;
  });

  // Filter months based on search query and exclude already selected ones
  const filteredMonths = months.filter((month: string) => {
    const matchesSearch = month.toLowerCase().includes(monthSearchQuery.toLowerCase());
    const notSelected = !selectedMonths.includes(month);
    return matchesSearch && notSelected;
  });

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCategoryDropdownOpen(false);
        setCategorySearchQuery("");
      }
      if (
        monthDropdownRef.current &&
        !monthDropdownRef.current.contains(event.target as Node)
      ) {
        setIsMonthDropdownOpen(false);
        setMonthSearchQuery("");
      }
      if (
        budgetDropdownRef.current &&
        !budgetDropdownRef.current.contains(event.target as Node)
      ) {
        setIsBudgetDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle category toggle
  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(category)) {
        return prev.filter((c) => c !== category);
      } else {
        return [...prev, category];
      }
    });
    setError("");
    setCategorySearchQuery("");
  };

  // Handle category removal from selected chips
  const handleCategoryRemove = (category: string) => {
    setSelectedCategories((prev) => prev.filter((c) => c !== category));
    setError("");
  };

  // Handle month toggle
  const handleMonthToggle = (month: string) => {
    setSelectedMonths((prev) => {
      if (prev.includes(month)) {
        return prev.filter((m) => m !== month);
      } else {
        return [...prev, month];
      }
    });
    setMonthSearchQuery("");
  };

  // Handle month removal from selected chips
  const handleMonthRemove = (month: string) => {
    setSelectedMonths((prev) => prev.filter((m) => m !== month));
  };

  const handleNext = () => {
    setError("");

    // Validate number of days
    let finalNumberOfDays: number | null = null;
    if (isCustomDays) {
      const customDaysNum = parseInt(customDays);
      if (isNaN(customDaysNum) || customDaysNum < 1) {
        setError("Please enter a valid number of days (minimum 1)");
        return;
      }
      finalNumberOfDays = customDaysNum;
    } else if (!numberOfDays) {
      setError("Please select the number of days for your itinerary");
      return;
    } else {
      finalNumberOfDays = numberOfDays;
    }

    // Validate categories - mandatory, minimum 4
    if (selectedCategories.length === 0) {
      setError("Please select at least 4 categories");
      return;
    }
    if (selectedCategories.length < 4) {
      setError(`Please select at least 4 categories. You have selected ${selectedCategories.length}.`);
      return;
    }

    // Validate budget type - mandatory
    if (!budgetType) {
      setError("Please select a budget type");
      return;
    }

    onNext({
      numberOfDays: finalNumberOfDays,
      categories: selectedCategories,
      bestTimeToVisit: selectedMonths,
      budgetType: budgetType,
    });
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-0">
      <div className="bg-dashboard-sidebar p-4 md:p-6 rounded-lg shadow-dashboard-elevated border border-dashboard-muted">
        {/* Step Indicator */}
        <div className="mb-4 md:mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-dashboard-accent flex items-center justify-center text-white text-sm font-semibold">
                2
              </div>
              <span className="text-dashboard font-poppins font-semibold text-sm md:text-base">
                Itinerary Details
              </span>
            </div>
            <span className="text-dashboard-accent text-xs md:text-sm font-poppins font-medium">
              Step 2 of 3
            </span>
          </div>
          <div className="w-full h-1.5 md:h-2 bg-dashboard-bg rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-dashboard-accent to-dashboard-secondary transition-all duration-500 ease-out w-2/3"></div>
          </div>
        </div>

        <div className="space-y-4 md:space-y-5">
          {/* Number of Days Selection */}
          <div className="group">
            <label className="text-dashboard font-semibold mb-1.5 font-poppins text-sm md:text-base flex items-center gap-1">
              <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Number of Days <span className="text-red-500">*</span>
            </label>

            {/* Standard Options */}
            <div className="grid grid-cols-4 gap-1.5">
              {[3, 5, 7].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => {
                    setNumberOfDays(days);
                    setIsCustomDays(false);
                    setCustomDays("");
                    setError("");
                  }}
                  className={`px-2 py-1.5 rounded-md border transition-all duration-200 font-poppins font-medium text-xs ${numberOfDays === days && !isCustomDays
                    ? "bg-dashboard-accent text-white border-dashboard-accent shadow-sm"
                    : "bg-dashboard-sidebar text-dashboard border-dashboard hover:border-dashboard-accent/50 hover:bg-dashboard-bg"
                    }`}
                >
                  {days} Days
                </button>
              ))}

              {/* Custom Option - Button or Input */}
              {isCustomDays ? (
                <input
                  type="number"
                  min="1"
                  value={customDays}
                  onChange={(e) => {
                    setCustomDays(e.target.value);
                    setError("");
                  }}
                  onBlur={() => {
                    if (customDays && parseInt(customDays) > 0) {
                      setNumberOfDays(parseInt(customDays));
                    }
                  }}
                  placeholder="Days"
                  className="px-2 py-1.5 bg-dashboard-sidebar border border-dashboard-accent rounded-md text-dashboard placeholder-dashboard-light focus:outline-none focus:ring-1 focus:ring-dashboard-accent focus:border-dashboard-accent transition-all duration-200 text-xs text-center"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomDays(true);
                    setNumberOfDays(null);
                    setCustomDays("");
                    setError("");
                  }}
                  className="px-2 py-1.5 rounded-md border transition-all duration-200 font-poppins font-medium text-xs bg-dashboard-sidebar text-dashboard border-dashboard hover:border-dashboard-accent/50 hover:bg-dashboard-bg"
                >
                  Custom
                </button>
              )}
            </div>
          </div>

          <div className="group">
            <label className="text-dashboard font-semibold mb-2 font-poppins text-sm md:text-base flex items-center gap-1">
              <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Best Time to Visit
              <span className="text-xs text-dashboard-light font-normal ml-1">(Select one or multiple months)</span>
            </label>

            {/* Selected Months Display - Outside ref so clicking here closes dropdown */}
            {selectedMonths.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedMonths.map((month: string) => (
                  <span
                    key={month}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dashboard-accent text-white border border-dashboard-accent font-poppins text-sm font-medium"
                  >
                    {month}
                    <button
                      type="button"
                      onClick={() => handleMonthRemove(month)}
                      className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                      aria-label={`Remove ${month}`}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Dropdown Input and Menu - Wrapped in ref */}
            <div className="relative" ref={monthDropdownRef}>
              <div className="relative">
                <input
                  type="text"
                  value={monthSearchQuery}
                  onChange={(e) => {
                    setMonthSearchQuery(e.target.value);
                    setIsMonthDropdownOpen(true);
                  }}
                  onFocus={() => setIsMonthDropdownOpen(true)}
                  placeholder={selectedMonths.length === 0 ? "Search and select months..." : "Add more months..."}
                  className="block w-full pl-3 pr-10 py-2 border border-dashboard rounded-md shadow-sm outline-none focus:ring-2 hover:ring-1 text-sm hover:ring-dashboard-accent font-poppins placeholder:text-dashboard-muted focus:ring-dashboard-accent bg-dashboard-sidebar text-dashboard"
                />
                <div
                  className="absolute inset-y-0 right-0 flex items-center px-2 cursor-pointer"
                  onClick={() => setIsMonthDropdownOpen((prev) => !prev)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 text-dashboard-light transform transition-transform ${isMonthDropdownOpen ? "rotate-180" : ""
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

              {/* Dropdown Menu */}
              {isMonthDropdownOpen && (
                <div className="absolute z-10 w-full mt-1 max-h-60 overflow-y-auto scrollbar-hide bg-dashboard-sidebar border border-dashboard rounded-md shadow-dashboard-elevated">
                  {filteredMonths.length === 0 ? (
                    <div className="px-4 py-3 font-poppins text-sm text-dashboard-light">
                      {monthSearchQuery
                        ? "No months found matching your search"
                        : "All months have been selected"}
                    </div>
                  ) : (
                    filteredMonths.map((month: string) => (
                      <button
                        key={month}
                        type="button"
                        onClick={() => handleMonthToggle(month)}
                        className="w-full text-left px-4 py-2 text-dashboard hover:bg-dashboard-accent hover:text-white font-poppins text-sm transition-colors cursor-pointer"
                      >
                        {month}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {selectedMonths.length > 0 && (
              <p className="text-xs text-dashboard-light font-poppins mt-2">
                {selectedMonths.length} month{selectedMonths.length === 1 ? "" : "s"} selected
              </p>
            )}
          </div>

          {/* Budget Type Selection */}
          <div className="group">
            <label className="text-dashboard font-semibold mb-2 font-poppins text-sm md:text-base flex items-center gap-1">
              <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Budget Type <span className="text-red-500">*</span>
            </label>

            <div className="relative" ref={budgetDropdownRef}>
              {/* Dropdown Input */}
              <div className="relative">
                <input
                  type="text"
                  value={getBudgetTypeLabel(budgetType)}
                  readOnly
                  onClick={() => setIsBudgetDropdownOpen((prev) => !prev)}
                  placeholder="Select budget type..."
                  className="block w-full pl-3 pr-10 py-2 border border-dashboard rounded-md shadow-sm outline-none focus:ring-2 hover:ring-1 text-sm hover:ring-dashboard-accent font-poppins placeholder:text-dashboard-muted focus:ring-dashboard-accent bg-dashboard-sidebar text-dashboard cursor-pointer"
                />
                <div
                  className="absolute inset-y-0 right-0 flex items-center px-2 cursor-pointer"
                  onClick={() => setIsBudgetDropdownOpen((prev) => !prev)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 text-dashboard-light transform transition-transform ${isBudgetDropdownOpen ? "rotate-180" : ""
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

              {/* Dropdown Menu */}
              {isBudgetDropdownOpen && (
                <div className="absolute z-10 w-full mt-1 max-h-60 overflow-y-auto scrollbar-hide bg-dashboard-sidebar border border-dashboard rounded-md shadow-dashboard-elevated">
                  {budgetTypeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setBudgetType(option.value);
                        setIsBudgetDropdownOpen(false);
                        setError("");
                      }}
                      className={`w-full text-left px-4 py-2 text-dashboard hover:bg-dashboard-accent hover:text-white font-poppins text-sm transition-colors cursor-pointer ${budgetType === option.value ? "bg-dashboard-accent text-white" : ""
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                  {budgetType && (
                    <button
                      type="button"
                      onClick={() => {
                        setBudgetType(null);
                        setIsBudgetDropdownOpen(false);
                        setError("");
                      }}
                      className="w-full text-left px-4 py-2 text-red-500 hover:bg-red-50 font-poppins text-sm transition-colors cursor-pointer border-t border-dashboard"
                    >
                      Clear selection
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Category Selection */}
          <div className="group">
            <label className="text-dashboard font-semibold mb-2 font-poppins text-sm md:text-base flex items-center gap-1">
              <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Guide Categories <span className="text-red-500">*</span>
              <span className="text-xs text-dashboard-light font-normal ml-1">(Select at least 4)</span>
            </label>

            {categoriesLoading ? (
              <div className="text-dashboard-light text-sm font-poppins py-2">
                Loading categories...
              </div>
            ) : (
              <>
                {selectedCategories.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {selectedCategories.map((category: string) => (
                      <span
                        key={category}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dashboard-accent text-white border border-dashboard-accent font-poppins text-sm font-medium"
                      >
                        {category}
                        <button
                          type="button"
                          onClick={() => handleCategoryRemove(category)}
                          className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                          aria-label={`Remove ${category}`}
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Dropdown Input and Menu - Wrapped in ref */}
                <div className="relative" ref={categoryDropdownRef}>
                  <div className="relative">
                    <input
                      type="text"
                      value={categorySearchQuery}
                      onChange={(e) => {
                        setCategorySearchQuery(e.target.value);
                        setIsCategoryDropdownOpen(true);
                      }}
                      onFocus={() => setIsCategoryDropdownOpen(true)}
                      placeholder={selectedCategories.length === 0 ? "Search and select categories..." : "Add more categories..."}
                      className="block w-full pl-3 pr-10 py-2 border border-dashboard rounded-md shadow-sm outline-none focus:ring-2 hover:ring-1 text-sm hover:ring-dashboard-accent font-poppins placeholder:text-dashboard-muted focus:ring-dashboard-accent bg-dashboard-sidebar text-dashboard"
                    />
                    <div
                      className="absolute inset-y-0 right-0 flex items-center px-2 cursor-pointer"
                      onClick={() => setIsCategoryDropdownOpen((prev) => !prev)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`h-5 w-5 text-dashboard-light transform transition-transform ${isCategoryDropdownOpen ? "rotate-180" : ""
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

                  {/* Dropdown Menu */}
                  {isCategoryDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 max-h-60 overflow-y-auto scrollbar-hide bg-dashboard-sidebar border border-dashboard rounded-md shadow-dashboard-elevated">
                      {/* Typing a category that does not exist yet is the primary path for a
                          first guide, and the only reason the required field is always
                          satisfiable. It is offered before the suggestions, not after. */}
                      {categorySearchQuery.trim()
                        && !selectedCategories.includes(categorySearchQuery.trim())
                        && !filteredCategories.includes(categorySearchQuery.trim()) && (
                        <button
                          type="button"
                          onClick={() => handleCategoryToggle(categorySearchQuery.trim())}
                          className="w-full text-left px-4 py-2 text-dashboard hover:bg-dashboard-accent hover:text-white font-poppins text-sm transition-colors cursor-pointer border-b border-dashboard"
                        >
                          Add &ldquo;{categorySearchQuery.trim()}&rdquo;
                        </button>
                      )}
                      {filteredCategories.length === 0 ? (
                        <div className="px-4 py-3 font-poppins text-sm text-dashboard-light">
                          {categorySearchQuery
                            ? "Type to add this as a new category"
                            : "Type a category to add it"}
                        </div>
                      ) : (
                        filteredCategories.map((category: string) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => handleCategoryToggle(category)}
                            className="w-full text-left px-4 py-2 text-dashboard hover:bg-dashboard-accent hover:text-white font-poppins text-sm transition-colors cursor-pointer"
                          >
                            {category}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {selectedCategories.length > 0 && (
              <p className={`text-xs font-poppins mt-2 ${selectedCategories.length < 4
                ? "text-orange-500"
                : "text-dashboard-light"
                }`}>
                {selectedCategories.length} categor{selectedCategories.length === 1 ? "y" : "ies"} selected
                {selectedCategories.length < 4 && ` (minimum 4 required)`}
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border-l-4 border-red-500 text-red-500 px-4 py-3 rounded-lg text-sm font-poppins flex items-start gap-2 animate-in slide-in-from-top-2 duration-300">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col md:flex-row gap-3 justify-between pt-5 border-t-2 border-dashboard-muted/50">
            <Button
              type="button"
              variant="ghost"
              btnText="Back"
              onClickHandler={onBack}
              className="order-3 md:order-1"
            />

            <div className="flex flex-col md:flex-row gap-3 order-1 md:order-2">
              <Button
                type="button"
                variant="primary"
                btnText="Next"
                onClickHandler={handleNext}
                  className="order-1 md:order-2"
              />
            </div>
          </div>
        </div>
      </div>
    </div >
  );
};

export default CreateGuideStep2;
