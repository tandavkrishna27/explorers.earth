import {describe,it,expect,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {I18nextProvider} from 'react-i18next';
import {englishI18n} from '../../../../../test/englishI18n';
import {explorersApiClient} from '../../../../../lib/explorersApiClient';
import {CreateBookListModal} from '../BooksHome';
describe('canonical Books create-list navigation',()=>{
 it('creates a private draft through canonical authority and supplies the actual ID',async()=>{
  const create=vi.spyOn(explorersApiClient,'createMyCollection').mockResolvedValue({id:'new-list'} as never);
  const onCreated=vi.fn(),onClose=vi.fn();
  render(<I18nextProvider i18n={englishI18n}><CreateBookListModal open onClose={onClose} accountDocumentId="display-only" currentListCount={100} username="owner" onCreated={onCreated}/></I18nextProvider>);
  await userEvent.type(screen.getByLabelText('Name'), 'Summer Reads');
  await userEvent.click(screen.getByRole('button',{name:'Create list'}));
  await waitFor(()=>expect(onCreated).toHaveBeenCalledWith('new-list'));
  expect(create.mock.calls[0][0]).toEqual({category:'books',title:'Summer Reads',description:null,slug:'summer-reads',visibility:'private',publicationState:'draft'});
  expect(onClose).toHaveBeenCalledTimes(1);create.mockRestore();
 });
});
