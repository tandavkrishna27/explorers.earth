import {describe,expect,it} from 'vitest';
import {isValidPostalCode,updateAccountRequestSchema} from '../../../../tunes/shared/explorersContract';
import {buildOnboardingAccountUpdate} from '../onboardingPayload';

const form={username:' Trail ',accountName:' Trail ',accountType:'Personal',bio:'',mobile_number:'',primaryAddress:'1 Main St',address:'1 Main St',city:'Leeds',country:'UK',state:'England',streetName:'Main St',postalCode:'  LS1 4AP '};

describe('onboarding account payload',()=>{
 it('sends the postal code the form collected, trimmed',()=>{
  const payload=buildOnboardingAccountUpdate(form,3,{});
  expect(payload.additionalAddresses?.[0]).toMatchObject({postalCode:'LS1 4AP',city:'Leeds',country:'UK',state:'England',streetName:'Main St'});
  expect(payload).toMatchObject({expectedRevision:3,handle:'trail',displayName:'Trail',onboardingStatus:'complete'});
 });
 it('is accepted by the account contract',()=>{
  expect(updateAccountRequestSchema.safeParse(buildOnboardingAccountUpdate(form,3,{})).success).toBe(true);
 });
 it('only attaches media that was uploaded',()=>{
  expect(buildOnboardingAccountUpdate(form,1,{})).not.toHaveProperty('profileImageId');
  expect(buildOnboardingAccountUpdate(form,1,{profileImageId:'a',backgroundImageId:'b'})).toMatchObject({profileImageId:'a',backgroundImageId:'b'});
 });
});

describe('postal code validation',()=>{
 it.each(['560001','SW1A 1AA','K1A 0B1','100-0001','1012 AB','D02 X285','75008','Ä1234'])('accepts %s',code=>{
  expect(isValidPostalCode(code)).toBe(true);
  expect(updateAccountRequestSchema.safeParse({expectedRevision:1,additionalAddresses:[{postalCode:code}]} as never).success).toBe(true);
 });
 it.each(['','1','  1 ','12345678901','12<script>','12_34','12.34','--','   '])('rejects %j',code=>{
  expect(isValidPostalCode(code)).toBe(false);
 });
 it('rejects bad codes on the server contract but still lets the field be cleared',()=>{
  const parse=(postalCode:string)=>updateAccountRequestSchema.safeParse({expectedRevision:1,additionalAddresses:[{postalCode}],primaryAddress:{postalCode}} as never).success;
  expect(parse('12<script>')).toBe(false);expect(parse('1')).toBe(false);expect(parse('12345678901')).toBe(false);
  expect(parse('')).toBe(true);expect(parse(' 560001 ')).toBe(true);
 });
});
