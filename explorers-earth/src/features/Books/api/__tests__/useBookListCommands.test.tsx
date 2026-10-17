import {describe,it,expect,vi} from 'vitest';
import {renderHook,act} from '@testing-library/react';
import {explorersApiClient} from '../../../../lib/explorersApiClient';
import {useBookListCommands} from '../useBookListCommands';
vi.mock('../../../../lib/explorersApiClient',()=>({explorersApiClient:{getMyEditableCollection:vi.fn(),archiveMyCollection:vi.fn(),updateAccount:vi.fn()}}));
describe('canonical Books list deletion',()=>{it('archives observed list without category publication or saved pin writes',async()=>{const observed={collection:{id:'list',revision:3}};vi.mocked(explorersApiClient.getMyEditableCollection).mockResolvedValue(observed as never);const {result}=renderHook(()=>useBookListCommands());await act(()=>result.current.archive({variables:{documentId:'list'}}));expect(explorersApiClient.archiveMyCollection).toHaveBeenCalledWith(observed,expect.any(String));expect(explorersApiClient.updateAccount).not.toHaveBeenCalled();});});
