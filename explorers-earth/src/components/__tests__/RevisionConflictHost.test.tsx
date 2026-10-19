import {act,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {toast,Toaster} from 'sonner';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/resources/en.json';
import RevisionConflictHost from '../RevisionConflictHost';
import {announceRevisionConflict} from '../../lib/revisionConflict';
import {reportProfileSaveError} from '../../features/Profile/profileSaveError';

const conflict=Object.assign(new Error('Account changed'),{status:409,code:'CONFLICT'});

describe('revision conflict message',()=>{
 beforeEach(async()=>{
  await i18n.changeLanguage('en');
  // jsdom has no pointer capture, which sonner calls when a toast button is pressed.
  Element.prototype.setPointerCapture=vi.fn();Element.prototype.releasePointerCapture=vi.fn();
 });
 afterEach(()=>{toast.dismiss();vi.restoreAllMocks();});

 it('tells the owner it changed elsewhere and offers Reload',async()=>{
  const reload=vi.fn();
  render(<><Toaster/><RevisionConflictHost reload={reload}/></>);
  act(()=>{announceRevisionConflict(conflict);});
  expect(await screen.findByText(en.conflict.changedElsewhere)).toBeInTheDocument();
  expect(en.conflict.changedElsewhere).toBe('This was changed in another tab or device. Reload to see the latest version.');
  await userEvent.click(screen.getByRole('button',{name:en.conflict.reload}));
  expect(reload).toHaveBeenCalledTimes(1);
 });

 it('does not let the screen\'s own generic failure toast replace the explanation',async()=>{
  render(<><Toaster/><RevisionConflictHost reload={vi.fn()}/></>);
  act(()=>{announceRevisionConflict(conflict);toast.error('Failed to update visibility.');});
  expect(await screen.findByText(en.conflict.changedElsewhere)).toBeInTheDocument();
  expect(screen.queryByText('Failed to update visibility.')).toBeNull();
 });

 it('maps a Profile save conflict to the same message, not "unexpected error"',async()=>{
  const reload=vi.fn();
  render(<Toaster/>);
  act(()=>{reportProfileSaveError(conflict,i18n.t.bind(i18n) as never,reload);});
  expect(await screen.findByText(en.conflict.changedElsewhere)).toBeInTheDocument();
  expect(screen.queryByText(en.dashboard.profile.common.unexpectedError)).toBeNull();
  await userEvent.click(screen.getByRole('button',{name:en.conflict.reload}));
  expect(reload).toHaveBeenCalledTimes(1);
 });

 it('keeps the generic message for failures that are not conflicts',async()=>{
  // Past the window in which an earlier conflict hides generic failures.
  const later=Date.now()+60_000;vi.spyOn(Date,'now').mockReturnValue(later);
  render(<Toaster/>);
  act(()=>{reportProfileSaveError(new Error('boom'),i18n.t.bind(i18n) as never);});
  expect(await screen.findByText(en.dashboard.profile.common.unexpectedError)).toBeInTheDocument();
 });
});
