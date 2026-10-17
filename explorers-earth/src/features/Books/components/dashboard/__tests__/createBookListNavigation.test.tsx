import {describe,it,expect,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {explorersApiClient} from '../../../../../lib/explorersApiClient';
import {CreateBookListModal} from '../BooksHome';
describe('canonical Books create-list navigation',()=>{
 it('creates a private draft through canonical authority and supplies the actual ID',async()=>{
  const create=vi.spyOn(explorersApiClient,'createMyCollection').mockResolvedValue({id:'new-list'} as never);
  const onCreated=vi.fn(),onClose=vi.fn();
  render(<CreateBookListModal open onClose={onClose} accountDocumentId="display-only" currentListCount={100} username="owner" onCreated={onCreated}/>);
  await userEvent.type(document.querySelector('input[name="List_Name"]')!, 'Summer Reads');
  await userEvent.click(screen.getByRole('button',{name:'Create List'}));
  await waitFor(()=>expect(onCreated).toHaveBeenCalledWith('new-list'));
  expect(create.mock.calls[0][0]).toEqual({category:'books',title:'Summer Reads',description:null,slug:'summer-reads',visibility:'private',publicationState:'draft'});
  expect(onClose).toHaveBeenCalledTimes(1);create.mockRestore();
 });
});
