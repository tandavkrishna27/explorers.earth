import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SetupState {
  accountScope: string | null;
  sessionGeneration: number | null;
  isProfileComplete: boolean;
  isRecommendationsComplete: boolean;
  bindAccount: (accountId: string, onboardingStatus: "incomplete" | "complete", generation?: number) => void;
  setSetupStatus: (profileComplete: boolean, recommendationsComplete: boolean, accountId?: string, generation?: number) => void;
}

const useSetupStore = create<SetupState>()(
  persist(
    (set) => ({
      accountScope: null,
      sessionGeneration: null,
      isProfileComplete: false,
      isRecommendationsComplete: false,
      bindAccount: (accountId, onboardingStatus, generation) => set((state) => ({
        accountScope: accountId,
        sessionGeneration: generation ?? null,
        isProfileComplete: onboardingStatus === "complete",
        isRecommendationsComplete: state.accountScope === accountId && state.sessionGeneration === (generation ?? null)
          ? state.isRecommendationsComplete : false,
      })),
      setSetupStatus: (profileComplete, recommendationsComplete, accountId, generation) =>
        set((state) => !accountId || accountId !== state.accountScope || state.sessionGeneration !== (generation ?? null) ? state : ({
          isProfileComplete: profileComplete,
          isRecommendationsComplete: recommendationsComplete,
        })),
    }),
    {
      name: "setup-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: () => ({}),
      merge: (_persisted, current) => current,
    }
  )
);

export default useSetupStore;

