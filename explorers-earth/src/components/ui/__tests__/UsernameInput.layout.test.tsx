import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {Formik} from 'formik';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import UsernameInput from '../UsernameInput';

const validate=vi.hoisted(()=>vi.fn());
vi.mock('../../../hooks/useUsernameValidation',()=>({useUsernameValidation:()=>({validateUsernameWithAvailability:validate,isValidating:false})}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));

const renderField=(checkAvailability:boolean)=>render(
 <Formik initialValues={{username:'old-handle'}} onSubmit={()=>undefined}>
  <UsernameInput name="username" label="Username" originalValue="old-handle" checkAvailability={checkAvailability}/>
 </Formik>);

describe('username input message area',()=>{
 beforeEach(()=>{validate.mockReset();});

 it('keeps its height when the availability message goes away on blur',async()=>{
  // Available while typing, then nothing to say once the field is re-checked on blur.
  validate.mockResolvedValueOnce({isValid:true,errors:[],warnings:[],suggestions:[],normalizedUsername:'new-handle',availability:{isAvailable:true}})
   .mockResolvedValue({isValid:true,errors:[],warnings:[],suggestions:[],normalizedUsername:'new-handle'});
  renderField(true);
  const area=screen.getByTestId('username-messages');
  expect(area).toHaveClass('min-h-[1.75rem]');

  const input=screen.getByRole('textbox');
  fireEvent.focus(input);
  fireEvent.change(input,{target:{value:'new-handle'}});
  await waitFor(()=>expect(screen.getByText(/auth.validations.username.available/)).toBeInTheDocument());
  expect(screen.getByTestId('username-messages')).toHaveClass('min-h-[1.75rem]');

  fireEvent.blur(input);
  await waitFor(()=>expect(screen.queryByText(/auth.validations.username.available/)).toBeNull());
  // The message is gone, the reserved space is not.
  expect(screen.getByTestId('username-messages')).toHaveClass('min-h-[1.75rem]');
 });

 it('only reserves the space where availability is checked',()=>{
  renderField(false);
  expect(screen.getByTestId('username-messages')).not.toHaveClass('min-h-[1.75rem]');
 });
});
