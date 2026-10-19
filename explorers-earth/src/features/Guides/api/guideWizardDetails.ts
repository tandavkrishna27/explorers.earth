import {guideBudgetTierFromLabel, guideTypeFromLabel, type GuideCollectionDetails, type GuidePlaceSnapshot} from '../../../../../tunes/shared/explorersGuideContract';

export type GuideWizardFields = {
 guideType: string; locationMode: 'single' | 'multi'; numberOfDays: number | null;
 bestTimeToVisit: string[]; categories: string[];
 // Optional: the wizard's Budget Type choice (Backpacker ... Ultra-Luxury), or null.
 budgetTier?: string | null;
};

export function guideWizardDetails(form: GuideWizardFields, place: GuidePlaceSnapshot,
 existing?: GuideCollectionDetails): GuideCollectionDetails {
 // The wizard collects no amount/currency, so edits retain those fields from the fresh
 // read. The tier is the wizard's own field: clearing it clears it.
 return {guideType:guideTypeFromLabel(form.guideType),multiCity:form.locationMode==='multi',numberOfDays:form.numberOfDays||null,
  estimatedBudget:existing?.estimatedBudget??null,budgetCurrency:existing?.budgetCurrency??null,
  budgetType:existing?.budgetType??null,budgetTier:guideBudgetTierFromLabel(form.budgetTier),bestTimeToVisit:[...form.bestTimeToVisit],
  categories:[...form.categories],tags:existing?[...existing.tags]:[],tipsNotes:existing?.tipsNotes??null,
  place,locationEntityId:existing?.locationEntityId??null};
}
