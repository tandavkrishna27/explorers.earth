/**
 * BudgetInputModal Component
 * Modal for adding/editing custom budget for a place
 */

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { suggestedCurrency } from "../../../lib/currencyOptions";
import { precisionMessage } from "../../../lib/money";
import BudgetIcon from "../../../assets/icons/BudgetIcon";
import { getBudgetDisplayText } from "../utils/priceLevelUtils";
import CurrencyAmountInput from "../../../components/ui/CurrencyAmountInput";

interface BudgetInputModalProps {
  isOpen: boolean;
  placeName: string;
  currentBudget?: string;
  budgetAmount?: number;
  budgetCurrency?: string;
  existingPriceRange?: string;
  existingPriceLevel?: number;
  onSave: (budget: string) => void;
  /** amount is null to clear the budget; 0 is a real amount, shown as Free. */
  onSaveCurrency?: (amount: number | null, currency: string) => void;
  onClose: () => void;
}

const BudgetInputModal: React.FC<BudgetInputModalProps> = ({
  isOpen,
  placeName,
  currentBudget,
  budgetAmount,
  budgetCurrency,
  existingPriceRange,
  existingPriceLevel,
  onSave,
  onSaveCurrency,
  onClose,
}) => {
  // Always use new currency format if onSaveCurrency is provided
  const useNewFormat = !!onSaveCurrency;
  const { t, i18n } = useTranslation();
  // The region's currency when the browser reports one; otherwise empty, never USD.
  const startingCurrency = suggestedCurrency([i18n?.language, ...(typeof navigator === "undefined" ? [] : navigator.languages ?? [])]) ?? "";
  
  const [budgetValue, setBudgetValue] = useState<{ amount: string; currency: string }>({
    amount: budgetAmount?.toString() || "",
    currency: budgetCurrency || startingCurrency,
  });
  const [legacyBudget, setLegacyBudget] = useState(currentBudget || "");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (useNewFormat) {
        // Use new format - initialize from budgetAmount/budgetCurrency or legacy currentBudget
        if (budgetAmount !== undefined && budgetCurrency) {
          setBudgetValue({
            amount: budgetAmount.toString(),
            currency: budgetCurrency,
          });
        } else if (currentBudget) {
          // Try to parse legacy format (basic extraction)
          // For now, just initialize with empty and let user enter new value
          setBudgetValue({
            amount: "",
            currency: startingCurrency,
          });
        } else {
          setBudgetValue({
            amount: "",
            currency: startingCurrency,
          });
        }
      } else {
        // Legacy format fallback
        setLegacyBudget(currentBudget || "");
      }
      setError("");
    }
  }, [isOpen, currentBudget, budgetAmount, budgetCurrency, useNewFormat]);

  const handleSave = () => {
    if (useNewFormat) {
      // New currency format
      const amount = parseFloat(budgetValue.amount);
      if (!budgetValue.amount || isNaN(amount) || amount < 0) {
        setError("Please enter a valid budget amount");
        return;
      }
      if (!budgetValue.currency) {
        setError(t("currency.needsCurrency"));
        return;
      }
      const problem = precisionMessage(t, budgetValue.amount, budgetValue.currency);
      if (problem) {
        setError(problem);
        return;
      }
      onSaveCurrency!(amount, budgetValue.currency);
      onClose();
    } else {
      // Legacy string format (for backward compatibility)
      const trimmedBudget = legacyBudget.trim();
      
      if (!trimmedBudget) {
        setError("Please enter a budget amount");
        return;
      }

      // Basic validation - check if it contains some numbers or currency symbols
      const hasValidContent = /[\d$€£¥₹]/.test(trimmedBudget);
      if (!hasValidContent) {
        setError("Please enter a valid budget (e.g., $50, ₹500-1000, €20-30)");
        return;
      }

      onSave(trimmedBudget);
      onClose();
    }
  };

  const handleClear = () => {
    if (useNewFormat) {
      onSaveCurrency!(null, budgetValue.currency);
    } else {
      onSave("");
    }
    onClose();
  };

  const googleBudget = getBudgetDisplayText({
    priceRange: existingPriceRange,
    priceLevel: existingPriceLevel,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[150] p-4">
      <div className="bg-dashboard-sidebar rounded-lg shadow-dashboard-elevated border border-dashboard max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <BudgetIcon size="6" color="white" />
          <div className="flex-1 min-w-0">
            <h3 className="text-dashboard font-poppins font-semibold text-lg">
              {currentBudget ? "Edit Budget" : "Add Budget"}
            </h3>
            <p className="text-dashboard-light text-xs font-poppins truncate">
              {placeName}
            </p>
          </div>
        </div>

        {/* Google Budget Info */}
        {googleBudget && (
          <div className="mb-4 bg-blue-500/10 border border-blue-400/30 rounded-lg p-3">
            <p className="text-xs text-blue-400/70 font-poppins font-medium mb-1">
              Google Suggested
            </p>
            <p className="text-sm text-blue-400 font-poppins font-semibold">
              {googleBudget}
            </p>
          </div>
        )}

        <p className="text-dashboard-light text-sm font-poppins mb-4">
          Enter your budget for this place.
        </p>

        {/* Budget Input - Always use new Currency Format if onSaveCurrency is provided */}
        {useNewFormat ? (
          <CurrencyAmountInput
            value={budgetValue}
            onChange={setBudgetValue}
            placeholder="Enter amount"
            className="mb-2"
          />
        ) : (
          /* Legacy Budget Input (fallback only if onSaveCurrency not provided) */
          <input
            type="text"
            value={legacyBudget}
            onChange={(e) => {
              setLegacyBudget(e.target.value);
              setError("");
            }}
            placeholder="e.g., $50, ₹500-1000, €20-30"
            className="w-full p-3 bg-dashboard-muted text-dashboard rounded-lg border border-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent font-poppins text-sm mb-2"
            autoFocus
          />
        )}
        
        {error && (
          <p className="text-red-400 text-xs font-poppins mb-4">
            {error}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 justify-end mt-4">
          {(currentBudget || (useNewFormat && budgetAmount !== undefined) || (useNewFormat && budgetValue.amount !== "")) && (
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors font-poppins text-sm font-medium border border-red-400/30"
            >
              Clear Budget
            </button>
          )}
          <button
            type="button"
            onClick={() => onClose()}
            className="px-4 py-2 bg-dashboard-muted text-dashboard rounded-lg hover:bg-dashboard-bg transition-colors font-poppins text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-dashboard-accent text-white rounded-lg hover:opacity-90 transition-opacity font-poppins text-sm font-medium"
          >
            Save Budget
          </button>
        </div>
      </div>
    </div>
  );
};

export default BudgetInputModal;
