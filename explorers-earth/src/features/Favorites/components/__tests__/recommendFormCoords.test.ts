import {describe,expect,it} from 'vitest';
import {submittedCoordinates} from '../recommendFormCoords';

const base={isPlace:true,isEdit:false,hasProviderPlace:false,userEdited:false,initial:{},chosen:null};
describe('submittedCoordinates',()=>{
 it('never invents coordinates for a manual place',()=>{
  expect(submittedCoordinates(base)).toEqual({lat:null,lng:null});
 });
 it('stores a point the user or provider chose',()=>{
  expect(submittedCoordinates({...base,chosen:{lat:12.5,lng:77.5}})).toEqual({lat:12.5,lng:77.5});
 });
 it('keeps stored coordinates on an untouched edit, and none when there were none',()=>{
  expect(submittedCoordinates({...base,isEdit:true,initial:{lat:'1.5',lng:2}})).toEqual({lat:1.5,lng:2});
  expect(submittedCoordinates({...base,isEdit:true,initial:{lat:null,lng:undefined}})).toEqual({lat:null,lng:null});
 });
 it('stores no coordinates for a person',()=>{
  expect(submittedCoordinates({...base,isPlace:false,chosen:{lat:1,lng:2}})).toEqual({lat:null,lng:null});
 });
});
