import {describe,it,expect} from 'vitest';
import {guideWizardDetails} from '../guideWizardDetails';
import {guideCollectionDetailsSchema} from '../../../../../../tunes/shared/explorersGuideContract';

const form={guideType:'Itinerary',locationMode:'single' as const,numberOfDays:3,bestTimeToVisit:['अक्टूबर'],categories:['culture','food','यात्रा','café']};
const place={name:'कोलकाता',address:'भारत',placeId:'guide-city',rating:4.5,ratingsCount:12,lat:0,lng:0};
describe('actual guide wizard canonical details',()=>{
 it('persists the selected Itinerary type with non-ASCII metadata',()=>{
  const result=guideCollectionDetailsSchema.parse(guideWizardDetails(form,place));
  expect(result.guideType).toBe('itinerary');expect(result.categories).toEqual(form.categories);
  expect(result.bestTimeToVisit).toEqual(form.bestTimeToVisit);expect(result.place).toEqual(place);expect(result.numberOfDays).toBe(3);
 });
 it.each(['itinerary','city','experience','collection'])('preserves recognized canonical edit type %s',guideType=>{
  expect(guideWizardDetails({...form,guideType},place).guideType).toBe(guideType);
 });
 it('preserves refreshed canonical fields the wizard does not author',()=>{
  const existing=guideCollectionDetailsSchema.parse({...guideWizardDetails(form,place),guideType:'city',estimatedBudget:'1234.50',budgetCurrency:'INR',budgetType:'per-person',tags:['यात्रा'],tipsNotes:[{type:'paragraph',children:[{text:'सुबह café'}]}],locationEntityId:'00000000-0000-4000-8000-000000000001'});
  const result=guideCollectionDetailsSchema.parse(guideWizardDetails({...form,numberOfDays:5,categories:['new','category','यात्रा','café']},place,existing));
  for(const key of ['estimatedBudget','budgetCurrency','budgetType','tags','tipsNotes','locationEntityId'] as const)expect(result[key]).toEqual(existing[key]);
  expect(result.numberOfDays).toBe(5);expect(result.categories).toEqual(['new','category','यात्रा','café']);expect(existing.numberOfDays).toBe(3);
 });
 it('keeps Theme and uncollected budget values null without inventing currency or tier mapping',()=>{
  const result=guideCollectionDetailsSchema.parse(guideWizardDetails({...form,guideType:'Theme',numberOfDays:null},{}));
  expect(result.guideType).toBeNull();expect(result.estimatedBudget).toBeNull();expect(result.budgetCurrency).toBeNull();expect(result.budgetType).toBeNull();
 });
});
