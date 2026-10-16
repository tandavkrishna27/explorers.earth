import type { RevisionInput, UpdateAccountInput } from '../../../../../tunes/shared/explorersContract';
import { explorersApiClient } from '../../../lib/explorersApiClient';

/** Explicit editable fields and expected revision are required for every owner save. */
export const updateProfile = (input: UpdateAccountInput & RevisionInput, signal?: AbortSignal) =>
  explorersApiClient.updateAccount(input, signal);
