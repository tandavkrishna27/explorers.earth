import React, { useMemo, useState } from "react";
import {useGuideEditing} from '../../context/GuideEditingProvider';
import { toast } from "sonner";
import { BudgetPlace, BudgetData } from "../../types/guideSectionTypes";
import { parseBudget } from "../../utils/guideDataParser";
import { getBudgetDisplayText } from "../../utils/priceLevelUtils";
import BudgetIcon from "../../../../assets/icons/BudgetIcon";
import EditIcon from "../../../../assets/icons/EditIcon";
import BudgetInputModal from "../BudgetInputModal";

interface BudgetTableProps {
  guide: {
    documentId?: string;
    guide_sections?: any[];
    Estimated_Budget?: number;
  };
}

interface BudgetItem {
  sectionId: string;
  sectionTitle: string;
  sectionSequence: number;
  placeName: string;
  priceDisplay: string;
  priceLevel?: number;
  priceRange?: string;
  customBudget?: string;
  budgetAmount?: number;
  budgetCurrency?: string;
  placeId: string;
  period: "morning" | "afternoon" | "evening";
}

const BudgetTable: React.FC<BudgetTableProps> = ({ guide }) => {
  const [editingBudget, setEditingBudget] = useState<BudgetItem | null>(null);
  const {getSection, saveSection} = useGuideEditing();

  const budgetItems = useMemo(() => {
    const sections = guide.guide_sections || [];

    const uniqueSections = sections.filter(
      (section: any, index: number, self: any[]) =>
        index ===
        self.findIndex((s: any) => s.documentId === section.documentId)
    );

    const sortedSections = [...uniqueSections].sort(
      (a, b) => (a.Sequence || 0) - (b.Sequence || 0)
    );

    const items: BudgetItem[] = [];

    sortedSections.forEach((section) => {
      const budget = parseBudget(section.Budget);

      // Process each period separately to track which period each place belongs to
      const processPeriod = (
        places: BudgetPlace[],
        period: "morning" | "afternoon" | "evening"
      ) => {
        places.forEach((place) => {
          if (place && (
            place.budgetAmount !== undefined || 
            place.customBudget || 
            place.priceRange || 
            typeof place.priceLevel === "number"
          )) {
            const priceDisplay = getBudgetDisplayText(place);
            if (priceDisplay) {
              items.push({
                sectionId: section.documentId,
                sectionTitle: section.Title || `Day ${section.Sequence || 1}`,
                sectionSequence: section.Sequence || 0,
                placeName: place.name,
                priceDisplay,
                priceLevel: place.priceLevel,
                priceRange: place.priceRange,
                customBudget: place.customBudget,
                budgetAmount: place.budgetAmount,
                budgetCurrency: place.budgetCurrency,
                placeId: place.place_id,
                period,
              });
            }
          }
        });
      };

      processPeriod(budget.morning || [], "morning");
      processPeriod(budget.afternoon || [], "afternoon");
      processPeriod(budget.evening || [], "evening");
    });

    return items;
  }, [guide.guide_sections]);

  // Group items by section
  const groupedItems = useMemo(() => {
    const grouped = new Map<number, BudgetItem[]>();
    budgetItems.forEach((item) => {
      const existing = grouped.get(item.sectionSequence) || [];
      grouped.set(item.sectionSequence, [...existing, item]);
    });
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  }, [budgetItems]);

  /**
   * Update budget for a specific place in a guide section (legacy string format)
   * Updates the Budget JSON field in the section
   */
  const handleSaveBudget = async (budget: string) => {
    if (!editingBudget) return;

    try {
      // Find the section being edited
      const section = guide.guide_sections?.find(
        (s: any) => s.documentId === editingBudget.sectionId
      );

      if (!section) {
        toast.error("Section not found");
        return;
      }

      // Parse existing budget data
      const existingBudget = parseBudget(section.Budget);

      // Update the specific place's budget in the correct period
      const updatePlaceBudget = (places: BudgetPlace[]) => {
        return places.map((place) => {
          if (place.place_id === editingBudget.placeId) {
            return {
              ...place,
              customBudget: budget || undefined,
              // Clear new format when using legacy
              budgetAmount: undefined,
              budgetCurrency: undefined,
            };
          }
          return place;
        });
      };

      // Create updated budget data
      const updatedBudget: BudgetData = {
        morning: editingBudget.period === "morning" 
          ? updatePlaceBudget(existingBudget.morning || [])
          : existingBudget.morning || [],
        afternoon: editingBudget.period === "afternoon"
          ? updatePlaceBudget(existingBudget.afternoon || [])
          : existingBudget.afternoon || [],
        evening: editingBudget.period === "evening"
          ? updatePlaceBudget(existingBudget.evening || [])
          : existingBudget.evening || [],
      };

      // Only the budget block changes; the save keeps every other block as it is.
      const target = getSection(editingBudget.sectionId);
      if (!target) throw new Error("That part of the guide is no longer there. Refresh and try again.");
      await saveSection(editingBudget.sectionId, {
        title: target.Title,
        description: target.Description ?? null,
        Budget: updatedBudget,
      });

      if (budget) {
        toast.success("Budget updated successfully!");
      } else {
        toast.success("Budget removed successfully!");
      }

      setEditingBudget(null);
    } catch (error: any) {
      console.error("Error updating budget:", error);
      toast.error(error.message || "Failed to update budget. Please try again.");
    }
  };

  /**
   * Update budget with currency format (new format)
   */
  const handleSaveBudgetCurrency = async (amount: number, currency: string) => {
    if (!editingBudget) return;

    try {
      // Find the section being edited
      const section = guide.guide_sections?.find(
        (s: any) => s.documentId === editingBudget.sectionId
      );

      if (!section) {
        toast.error("Section not found");
        return;
      }

      // Parse existing budget data
      const existingBudget = parseBudget(section.Budget);

      // Update the specific place's budget in the correct period
      const updatePlaceBudget = (places: BudgetPlace[]) => {
        return places.map((place) => {
          if (place.place_id === editingBudget.placeId) {
            if (amount > 0) {
              return {
                ...place,
                budgetAmount: amount,
                budgetCurrency: currency,
                // Clear legacy format when using new format
                customBudget: undefined,
              };
            } else {
              // Clear budget
              return {
                ...place,
                budgetAmount: undefined,
                budgetCurrency: undefined,
                customBudget: undefined,
              };
            }
          }
          return place;
        });
      };

      // Create updated budget data
      const updatedBudget: BudgetData = {
        morning: editingBudget.period === "morning" 
          ? updatePlaceBudget(existingBudget.morning || [])
          : existingBudget.morning || [],
        afternoon: editingBudget.period === "afternoon"
          ? updatePlaceBudget(existingBudget.afternoon || [])
          : existingBudget.afternoon || [],
        evening: editingBudget.period === "evening"
          ? updatePlaceBudget(existingBudget.evening || [])
          : existingBudget.evening || [],
      };

      // Only the budget block changes; the save keeps every other block as it is.
      const target = getSection(editingBudget.sectionId);
      if (!target) throw new Error("That part of the guide is no longer there. Refresh and try again.");
      await saveSection(editingBudget.sectionId, {
        title: target.Title,
        description: target.Description ?? null,
        Budget: updatedBudget,
      });

      if (amount > 0) {
        toast.success("Budget updated successfully!");
      } else {
        toast.success("Budget removed successfully!");
      }

      setEditingBudget(null);
    } catch (error: any) {
      console.error("Error updating budget:", error);
      toast.error(error.message || "Failed to update budget. Please try again.");
    }
  };

  if (budgetItems.length === 0) {
    return (
      <div className="bg-dashboard-sidebar rounded-lg shadow-dashboard-elevated p-6 border border-dashboard-muted">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-600/10 text-green-400 flex items-center justify-center ring-1 ring-green-400/20">
            <BudgetIcon size="5" />
          </div>
          <div>
            <h2 className="text-dashboard text-xl font-poppins font-bold">
              Budget Overview
            </h2>
            <p className="text-dashboard-light/60 text-sm font-poppins">
              Track expenses across your guide
            </p>
          </div>
        </div>
        <div className="bg-dashboard-bg/30 rounded-lg p-8 text-center border border-dashboard-muted/30">
          <p className="text-dashboard-light text-sm font-poppins">
            No budget information available yet. Add places with pricing details to your itinerary.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dashboard-sidebar rounded-lg shadow-dashboard-elevated p-6 border border-dashboard-muted">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-600/10 text-green-400 flex items-center justify-center ring-1 ring-green-400/20">
            <BudgetIcon size="5" />
          </div>
          <div>
            <h2 className="text-dashboard text-xl font-poppins font-bold">
              Budget Overview
            </h2>
            <p className="text-dashboard-light/60 text-sm font-poppins">
              {budgetItems.length} {budgetItems.length === 1 ? "item" : "items"} with pricing information
            </p>
          </div>
        </div>

        {guide.Estimated_Budget && (
          <div className="bg-green-500/10 px-4 py-2 rounded-lg border border-green-400/30">
            <p className="text-xs text-green-400/70 font-poppins font-medium">
              Estimated Budget
            </p>
            <p className="text-lg text-green-400 font-poppins font-bold">
              ${guide.Estimated_Budget}
            </p>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto scrollbar-hide">
        <table className="w-full">
          <thead>
            <tr className="border-b border-dashboard-muted/30">
              <th className="text-left py-3 px-4 text-xs font-poppins font-semibold text-dashboard-light/70 uppercase tracking-wider">
                Day
              </th>
              <th className="text-left py-3 px-4 text-xs font-poppins font-semibold text-dashboard-light/70 uppercase tracking-wider">
                Place/Activity
              </th>
              <th className="text-right py-3 px-4 text-xs font-poppins font-semibold text-dashboard-light/70 uppercase tracking-wider">
                Price
              </th>
              <th className="text-right py-3 px-4 text-xs font-poppins font-semibold text-dashboard-light/70 uppercase tracking-wider">
              </th>
            </tr>
          </thead>
          <tbody>
            {groupedItems.map(([sequence, items], groupIdx) => (
              <React.Fragment key={sequence}>
                {/* Day Header Row */}
                <tr className={groupIdx > 0 ? "border-t border-dashboard-muted/20" : ""}>
                  <td
                    colSpan={4}
                    className="py-3 px-4 bg-dashboard-bg/20"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500/30 to-blue-600/20 text-blue-400 flex items-center justify-center text-xs font-poppins font-bold">
                        {sequence}
                      </div>
                      <span className="text-sm font-poppins font-semibold text-dashboard">
                        {items[0].sectionTitle}
                      </span>
                      <span className="text-xs text-dashboard-light/50 font-poppins">
                        ({items.length} {items.length === 1 ? "item" : "items"})
                      </span>
                    </div>
                  </td>
                </tr>

                {/* Items for this day */}
                {items.map((item, itemIdx) => (
                  <tr
                    key={`${item.placeId}-${itemIdx}`}
                    className="border-b border-dashboard-muted/10 hover:bg-dashboard-bg/10 transition-colors"
                  >
                    <td className="py-3 px-4">
                      {/* Empty or item number */}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm font-poppins text-dashboard">
                        {item.placeName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-poppins font-semibold bg-green-500/10 text-green-400 border border-green-400/30 whitespace-nowrap">
                        {item.priceDisplay}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setEditingBudget(item)}
                        className="bg-dashboard-accent p-2 rounded-full shadow-md hover:bg-dashboard-accent/90 hover:scale-110 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:ring-offset-2"
                        aria-label="Edit budget"
                      >
                        <EditIcon color="white" />
                      </button>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Note */}
      <div className="mt-6 p-4 bg-dashboard-bg/20 rounded-lg border border-dashboard-muted/20">
        <p className="text-xs text-dashboard-light/50 font-poppins">
          <span className="font-semibold text-dashboard-light/70">Note:</span> Budget
          information shows custom budgets or Google Places pricing data. Price levels
          include Free, Inexpensive, Moderate, Expensive, and Very Expensive. Actual
          prices may vary.
        </p>
      </div>

      {/* Budget Input Modal */}
      {editingBudget && (
        <BudgetInputModal
          isOpen={!!editingBudget}
          placeName={editingBudget.placeName}
          currentBudget={editingBudget.customBudget}
          budgetAmount={editingBudget.budgetAmount}
          budgetCurrency={editingBudget.budgetCurrency}
          existingPriceRange={editingBudget.priceRange}
          existingPriceLevel={editingBudget.priceLevel}
          onSave={handleSaveBudget}
          onSaveCurrency={handleSaveBudgetCurrency}
          onClose={() => setEditingBudget(null)}
        />
      )}
    </div>
  );
};

export default BudgetTable;
