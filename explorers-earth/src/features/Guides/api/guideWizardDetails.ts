import {guideTypeSchema, type GuideCollectionDetails, type GuidePlaceSnapshot} from '../../../../../tunes/shared/explorersGuideContract';

export type GuideWizardFields = {
 guideType: string; locationMode: 'single' | 'multi'; numberOfDays: number | null;
 bestTimeToVisit: string[]; categories: string[];
};

export function guideWizardDetails(form: GuideWizardFields, place: GuidePlaceSnapshot,
 existing?: GuideCollectionDetails): GuideCollectionDetails {
 const selected=guideTypeSchema.safeParse(form.guideType==='Itinerary'?'itinerary':form.guideType);
 // Theme and legacy budget tiers have no adopted canonical mapping. The wizard
 // collects no amount/currency, so edits retain those fields from the fresh read.
 return {guideType:selected.success?selected.data:null,multiCity:form.locationMode==='multi',numberOfDays:form.numberOfDays||null,
  estimatedBudget:existing?.estimatedBudget??null,budgetCurrency:existing?.budgetCurrency??null,
  budgetType:existing?.budgetType??null,bestTimeToVisit:[...form.bestTimeToVisit],
  categories:[...form.categories],tags:existing?[...existing.tags]:[],tipsNotes:existing?.tipsNotes??null,
  place,locationEntityId:existing?.locationEntityId??null};
}
