import { memo, useMemo, useState } from "react";
import { parseBudget } from "../../../Guides/utils/guideDataParser";
import { getBudgetDisplayText } from "../../../Guides/utils/priceLevelUtils";
import BudgetIcon from "../../../../assets/icons/BudgetIcon";

interface PublicGuideBudgetViewProps {
  guide: any;
  sections: any[];
  selectedDay?: string;
}

const PublicGuideBudgetView = memo(({ guide, sections, selectedDay: externalSelectedDay }: PublicGuideBudgetViewProps) => {
  const [internalSelectedDay] = useState<string>("overview");
  const selectedDay = externalSelectedDay !== undefined ? externalSelectedDay : internalSelectedDay;

  // Get all budget items with numeric amount for calculation
  const allBudgetItems = useMemo(() => {
    const items: Array<{
      sectionTitle: string;
      sectionSequence: number;
      placeName: string;
      priceDisplay: string;
      period: string;
      numericAmount: number | null;
      currency: string | null;
    }> = [];

    // Helper function to extract numeric amount from budget place
    const extractNumericAmount = (place: any): { amount: number | null; currency: string | null } => {
      // Priority 1: budgetAmount (new format with currency)
      if (place.budgetAmount !== undefined && place.budgetAmount > 0 && place.budgetCurrency) {
        return { amount: place.budgetAmount, currency: place.budgetCurrency };
      }

      // Priority 2: customBudget (legacy string format - try to parse)
      if (place.customBudget) {
        // Try to extract numeric value from string (e.g., "₹500", "$100", "100 INR")
        const match = place.customBudget.match(/(\d+(?:\.\d+)?)/);
        if (match) {
          const amount = parseFloat(match[1]);
          // Try to extract currency symbol or code
          const currencyMatch = place.customBudget.match(/[₹$€£¥]|(?:USD|EUR|INR|GBP|JPY|CAD|AUD)/i);
          const currency = currencyMatch ? currencyMatch[0].toUpperCase() : null;
          return { amount, currency };
        }
      }

      // Priority 3: priceRange (e.g., "₹200-400", "$10-20") - use average or max
      if (place.priceRange) {
        // Extract all numbers from price range
        const numbers = place.priceRange.match(/(\d+(?:\.\d+)?)/g);
        if (numbers && numbers.length > 0) {
          const amounts = numbers.map((n: string) => parseFloat(n));
          // Use average if range, or single value
          const amount = amounts.length > 1 
            ? (amounts[0] + amounts[amounts.length - 1]) / 2 
            : amounts[0];
          // Try to extract currency
          const currencyMatch = place.priceRange.match(/[₹$€£¥]|(?:USD|EUR|INR|GBP|JPY|CAD|AUD)/i);
          const currency = currencyMatch ? currencyMatch[0].toUpperCase() : null;
          return { amount, currency };
        }
      }

      // Priority 4: priceLevel (0-4) - cannot convert to exact amount, skip
      return { amount: null, currency: null };
    };

    sections.forEach((section) => {
      const budget = parseBudget(section.Budget);

      const processPeriod = (
        places: any[],
        period: "morning" | "afternoon" | "evening"
      ) => {
        places.forEach((place) => {
          if (place && (place.budgetAmount !== undefined || place.customBudget || place.priceRange || typeof place.priceLevel === "number")) {
            const priceDisplay = getBudgetDisplayText(place);
            if (priceDisplay) {
              const { amount, currency } = extractNumericAmount(place);
              items.push({
                sectionTitle: section.Title || `Day ${section.Sequence || 1}`,
                sectionSequence: section.Sequence || 0,
                placeName: place.name,
                priceDisplay,
                period: period.charAt(0).toUpperCase() + period.slice(1),
                numericAmount: amount,
                currency: currency || place.budgetCurrency || null,
              });
            }
          }
        });
      };

      processPeriod(budget.morning || [], "morning");
      processPeriod(budget.afternoon || [], "afternoon");
      processPeriod(budget.evening || [], "evening");
    });

    return items.sort((a, b) => a.sectionSequence - b.sectionSequence);
  }, [sections]);

  // Filter items based on selected day
  const displayedItems = useMemo(() => {
    if (selectedDay === "overview") {
      return allBudgetItems;
    }
    const dayNum = parseInt(selectedDay.replace("day-", ""));
    return allBudgetItems.filter((item) => item.sectionSequence === dayNum);
  }, [allBudgetItems, selectedDay]);

  // Check if all displayed items have valid numeric amounts (no vague terms like "expensive", "luxury", etc.)
  const allItemsHaveNumericAmounts = useMemo(() => {
    if (displayedItems.length === 0) return false;

    // Check if all items have numeric amounts extracted
    // Items with only priceLevel (Free, Inexpensive, Moderate, Expensive, Very Expensive)
    // or vague text without numbers will have numericAmount === null
    return displayedItems.every((item) => {
      // Must have a valid numeric amount extracted
      // If numericAmount is null, it means we couldn't extract a number from:
      // - priceLevel only (which returns vague terms like "Expensive")
      // - customBudget with vague text only (no numbers)
      // - priceRange with no numbers
      if (item.numericAmount === null || item.numericAmount <= 0) {
        return false;
      }

      // Additional check: ensure priceDisplay contains numbers (safety check)
      // This catches edge cases where numericAmount might be set but display is vague
      const priceDisplay = item.priceDisplay || "";
      const hasNumbers = /\d/.test(priceDisplay);
      
      if (!hasNumbers) {
        return false;
      }

      return true;
    });
  }, [displayedItems]);

  // Calculate total budget for displayed items - only if all items have numeric amounts
  const totalBudget = useMemo(() => {
    // Only calculate if all items have valid numeric amounts
    if (!allItemsHaveNumericAmounts) {
      return [];
    }

    // Group items by currency
    const amountsByCurrency = new Map<string, number>();

    displayedItems.forEach((item) => {
      if (item.numericAmount !== null && item.numericAmount > 0) {
        const currency = item.currency || "UNKNOWN";
        const current = amountsByCurrency.get(currency) || 0;
        amountsByCurrency.set(currency, current + item.numericAmount);
      }
    });

    // Convert to array of { currency, amount }
    const totals = Array.from(amountsByCurrency.entries()).map(([currency, amount]) => ({
      currency,
      amount,
    }));

    return totals;
  }, [displayedItems, allItemsHaveNumericAmounts]);


  if (allBudgetItems.length === 0) {
    return (
      <div className="bg-[var(--category-card,#111827)] rounded-lg p-3 sm:p-4 md:p-6 border border-[var(--category-control-border,#374151)]">
        <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
          <BudgetIcon size="5" color="#4ADE80" />
          <h2 className="text-[var(--category-text,#FFFFFF)] text-base sm:text-lg md:text-xl font-poppins font-bold">Budget</h2>
        </div>
        <p className="text-[var(--category-muted,#9CA3AF)] text-xs sm:text-sm font-poppins">
          No budget information available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Estimated Budget Banner */}
      {guide.Estimated_Budget &&
        (guide.Estimated_Budget.currency || guide.Estimated_Budget.amount) && (
          <div className="bg-green-500/10 px-3 sm:px-4 py-2 sm:py-3 rounded-lg border border-green-400/30">
            <p className="text-[10px] sm:text-xs text-green-400/70 font-poppins font-medium mb-0.5 sm:mb-1">
              Estimated Budget
            </p>
            <p className="text-sm sm:text-base md:text-lg text-green-400 font-poppins font-bold">
              {guide.Estimated_Budget.currency} {guide.Estimated_Budget.amount}
            </p>
          </div>
        )}

      {/* Budget Table */}
      <div className="bg-[var(--category-card,#111827)] rounded-lg border border-[var(--category-control-border,#374151)] overflow-hidden">
        {/* Table Header */}
        <div className="bg-[var(--category-card,rgba(31,41,55,0.8))] border-b border-[var(--category-control-border,rgba(55,65,81,0.5))] px-3 sm:px-4 md:px-6 py-3 sm:py-4">
          <div className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-6">
            <div className="text-xs sm:text-sm md:text-base font-poppins font-bold bg-gradient-to-r from-[var(--category-text,hsl(var(--blue-cta)))] via-[var(--category-text,hsl(var(--blue-cta)))] to-[var(--category-text,hsl(var(--blue-final)))] bg-clip-text text-transparent">
              Day & Title
            </div>
            <div className="text-xs sm:text-sm md:text-base font-poppins font-bold bg-gradient-to-r from-[var(--category-text,hsl(var(--blue-cta)))] via-[var(--category-text,hsl(var(--blue-cta)))] to-[var(--category-text,hsl(var(--blue-final)))] bg-clip-text text-transparent">
              Place / Activity
            </div>
            <div className="text-xs sm:text-sm md:text-base font-poppins font-bold bg-gradient-to-r from-[var(--category-text,hsl(var(--blue-cta)))] via-[var(--category-text,hsl(var(--blue-cta)))] to-[var(--category-text,hsl(var(--blue-final)))] bg-clip-text text-transparent text-right">
              Amount
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-gray-700/50">
          {displayedItems.length === 0 ? (
            <div className="px-3 sm:px-4 md:px-6 py-8 sm:py-10 text-center">
              <p className="text-[var(--category-muted,#9CA3AF)] text-xs sm:text-sm font-poppins">
                No budget items available for this day.
              </p>
            </div>
          ) : (
            <>
              {displayedItems.map((item, index) => (
                <div
                  key={index}
                  className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 hover:bg-[var(--category-hover,rgba(31,41,55,0.3))] transition-colors duration-200"
                >
                  <div className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-6 items-center">
                    {/* Day & Title Column */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-[var(--category-card,rgba(59,130,246,0.3))] text-[var(--category-text,#60A5FA)] flex items-center justify-center text-[10px] sm:text-xs font-poppins font-bold flex-shrink-0">
                          {item.sectionSequence}
                        </div>
                        <span className="text-xs sm:text-sm md:text-base font-poppins font-semibold text-[var(--category-text,#FFFFFF)] line-clamp-2">
                          {item.sectionTitle}
                        </span>
                      </div>
                    </div>

                    {/* Place / Activity Column */}
                    <div className="min-w-0">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs sm:text-sm md:text-base font-poppins text-[var(--category-muted,#E5E7EB)] line-clamp-2">
                          {item.placeName}
                        </span>
                        <span className="text-[10px] sm:text-xs text-[var(--category-muted,#6B7280)] font-poppins">
                          {item.period}
                        </span>
                      </div>
                    </div>

                    {/* Amount Column */}
                    <div className="text-right">
                      <span className="inline-flex items-center px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm md:text-base font-poppins font-semibold bg-green-500/10 text-green-400 border border-green-400/30 whitespace-nowrap">
                        {item.priceDisplay}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Total Budget Row - Only show if there are numeric amounts */}
              {totalBudget.length > 0 && (
                <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-5 bg-gradient-to-r from-[var(--category-card,rgba(31,41,55,0.5))] to-[var(--category-card,rgba(55,65,81,0.3))] border-t-2 border-[var(--category-control-border,rgba(75,85,99,0.5))]">
                  <div className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-6 items-center">
                    {/* Empty column for spacing */}
                    <div></div>
                    
                    {/* Total Label */}
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-gradient-to-br from-green-500/30 to-green-600/30 text-green-400 flex items-center justify-center text-xs sm:text-sm font-poppins font-bold flex-shrink-0 border border-green-400/30">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <span className="text-sm sm:text-base md:text-lg font-poppins font-bold text-[var(--category-text,#FFFFFF)]">
                        Total Budget
                      </span>
                    </div>

                    {/* Total Amount(s) */}
                    <div className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        {totalBudget.map((total, idx) => {
                          // Format amount with currency
                          let formattedAmount: string;
                          if (total.currency && total.currency !== "UNKNOWN") {
                            try {
                              // Try to format with Intl.NumberFormat if currency code is valid
                              const currencyCode = total.currency.length === 3 ? total.currency : null;
                              if (currencyCode) {
                                formattedAmount = new Intl.NumberFormat("en-US", {
                                  style: "currency",
                                  currency: currencyCode,
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }).format(total.amount);
                              } else {
                                // Use currency symbol directly
                                formattedAmount = `${total.currency}${total.amount.toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`;
                              }
                            } catch {
                              formattedAmount = `${total.currency}${total.amount.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`;
                            }
                          } else {
                            formattedAmount = total.amount.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            });
                          }

                          return (
                            <span
                              key={idx}
                              className="inline-flex items-center px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base md:text-lg font-poppins font-bold bg-gradient-to-r from-green-500/20 to-green-600/20 text-green-400 border-2 border-green-400/50 shadow-lg shadow-green-500/20 whitespace-nowrap"
                            >
                              {formattedAmount}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

PublicGuideBudgetView.displayName = "PublicGuideBudgetView";

export default PublicGuideBudgetView;
