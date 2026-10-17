import { isDeepStrictEqual } from "node:util";
import {
  LiveProfileBatchFailure,
  type LiveProfileBatchFailureCode,
  type LiveProfileBatchFailureStage,
} from "./music";

export interface ProfileBatchRawAccount {
  documentId: string;
  updatedAt: string;
  social_media: Record<string, unknown>;
}

export interface ProfileBatchUpdateAccount {
  documentId: string;
  social_media: Record<string, unknown>;
}

export interface ProfileBatchDialog {
  type(): string;
  accept(): Promise<void>;
  dismiss(): Promise<void>;
}

type ProfileBatchProgress = {
  rowOrdinal: number;
  completedRows: number;
};

export async function profileBatchBoundary<Value>(
  stage: LiveProfileBatchFailureStage,
  code: LiveProfileBatchFailureCode,
  progress: ProfileBatchProgress,
  operation: () => Promise<Value>,
): Promise<Value> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof LiveProfileBatchFailure) throw error;
    throw new LiveProfileBatchFailure(stage, code, progress.rowOrdinal, progress.completedRows);
  }
}

export async function verifyProfileBatchGallery(input: {
  progress: ProfileBatchProgress;
  assertTabPresent: () => Promise<void>;
  assertTabVisible: () => Promise<void>;
  selectTab: () => Promise<void>;
  assertTabSelected: () => Promise<void>;
  assertPanelPresent: () => Promise<void>;
  assertPanelVisible: () => Promise<void>;
  assertPopulatedContent: () => Promise<void>;
  assertContentSource: () => Promise<void>;
}): Promise<void> {
  const { progress } = input;
  if (!Number.isSafeInteger(progress.rowOrdinal) || progress.rowOrdinal < 1 || progress.rowOrdinal > 12
      || !Number.isSafeInteger(progress.completedRows) || progress.completedRows !== progress.rowOrdinal - 1) {
    throw new Error("Live profile gallery progress is invalid");
  }
  // Each code describes the failed predicate, never arbitrary assertion text.
  await profileBatchBoundary("row-public-gallery-tab", "locator-missing", progress, input.assertTabPresent);
  await profileBatchBoundary("row-public-gallery-tab", "timeout", progress, input.assertTabVisible);
  await profileBatchBoundary("row-public-gallery-select", "timeout", progress, input.selectTab);
  await profileBatchBoundary("row-public-gallery-select", "attribute-mismatch", progress, input.assertTabSelected);
  await profileBatchBoundary("row-public-gallery-panel", "locator-missing", progress, input.assertPanelPresent);
  await profileBatchBoundary("row-public-gallery-panel", "timeout", progress, input.assertPanelVisible);
  await profileBatchBoundary("row-public-gallery-content", "content-insufficient", progress, input.assertPopulatedContent);
  await profileBatchBoundary("row-public-gallery-content", "attribute-mismatch", progress, input.assertContentSource);
}

function rawAccount(value: unknown): value is ProfileBatchRawAccount {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const account = value as Record<string, unknown>;
  return typeof account.documentId === "string" && account.documentId.length > 0
    && typeof account.updatedAt === "string" && account.updatedAt.length > 0
    && Boolean(account.social_media) && typeof account.social_media === "object"
    && !Array.isArray(account.social_media);
}

function updateAccount(value: unknown): value is ProfileBatchUpdateAccount {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const account = value as Record<string, unknown>;
  return typeof account.documentId === "string" && account.documentId.length > 0
    && Boolean(account.social_media) && typeof account.social_media === "object"
    && !Array.isArray(account.social_media);
}

export async function settleAbortedProfileMutation<Template>(input: {
  baselineAccount: ProfileBatchRawAccount;
  captureAbortedMutation: () => Promise<Template>;
  waitForSaveSettled: () => Promise<void>;
  onDialog: (handler: (dialog: ProfileBatchDialog) => Promise<void>) => void;
  offDialog: (handler: (dialog: ProfileBatchDialog) => Promise<void>) => void;
  reloadAndReadAccount: () => Promise<ProfileBatchRawAccount>;
}): Promise<{ template: Template; account: ProfileBatchRawAccount }> {
  const progress = { rowOrdinal: 0, completedRows: 0 } as const;
  const template = await profileBatchBoundary(
    "template-capture",
    "mutation-not-observed",
    progress,
    input.captureAbortedMutation,
  );
  if (template === undefined || template === null) {
    throw new LiveProfileBatchFailure("template-capture", "mutation-not-observed", 0, 0);
  }
  await profileBatchBoundary("abort-settle", "timeout", progress, input.waitForSaveSettled);

  let beforeUnloadCount = 0;
  let invalidDialog = false;
  let dialogOperationFailed = false;
  const handler = async (dialog: ProfileBatchDialog) => {
    if (dialog.type() !== "beforeunload" || beforeUnloadCount !== 0) {
      invalidDialog = true;
      try { await dialog.dismiss(); } catch { dialogOperationFailed = true; }
      return;
    }
    beforeUnloadCount += 1;
    try { await dialog.accept(); } catch { dialogOperationFailed = true; }
  };

  let account: ProfileBatchRawAccount | undefined;
  let navigationFailed = false;
  try {
    input.onDialog(handler);
    try {
      account = await input.reloadAndReadAccount();
    } catch {
      navigationFailed = true;
    }
  } catch {
    navigationFailed = true;
  } finally {
    try { input.offDialog(handler); } catch { navigationFailed = true; }
  }
  if (navigationFailed || invalidDialog || dialogOperationFailed || beforeUnloadCount !== 1 || !account) {
    throw new LiveProfileBatchFailure("abort-discard-navigation", "navigation-blocked", 0, 0);
  }
  if (!rawAccount(input.baselineAccount) || !rawAccount(account)
      || account.documentId !== input.baselineAccount.documentId) {
    throw new LiveProfileBatchFailure("abort-state-verify", "contract-invalid", 0, 0);
  }
  if (account.updatedAt !== input.baselineAccount.updatedAt) {
    throw new LiveProfileBatchFailure("abort-state-verify", "version-mismatch", 0, 0);
  }
  if (!isDeepStrictEqual(account.social_media, input.baselineAccount.social_media)) {
    throw new LiveProfileBatchFailure("abort-state-verify", "state-mismatch", 0, 0);
  }
  return { template, account };
}

export async function observeProfilePublish(input: {
  rowOrdinal: number;
  completedRows: number;
  observeUpdate: (markResponseObserved: () => void) => Promise<ProfileBatchUpdateAccount>;
  observeRefetch: (afterUpdateResponse: () => boolean) => Promise<ProfileBatchRawAccount>;
  triggerSave: () => Promise<void>;
  waitForSavedTerminal: () => Promise<void>;
}): Promise<ProfileBatchRawAccount> {
  const progress = { rowOrdinal: input.rowOrdinal, completedRows: input.completedRows };
  let updateResponseObserved = false;
  let updatePromise: Promise<ProfileBatchUpdateAccount>;
  let refetchPromise: Promise<ProfileBatchRawAccount>;
  try {
    updatePromise = input.observeUpdate(() => { updateResponseObserved = true; });
    void updatePromise.catch(() => undefined);
    refetchPromise = input.observeRefetch(() => updateResponseObserved);
    void refetchPromise.catch(() => undefined);
    await input.triggerSave();
  } catch (error) {
    if (error instanceof LiveProfileBatchFailure) throw error;
    throw new LiveProfileBatchFailure("row-publish-response", "http-failed", input.rowOrdinal, input.completedRows);
  }

  let updated: ProfileBatchUpdateAccount;
  let refetched: ProfileBatchRawAccount;
  try {
    [updated, refetched] = await Promise.all([updatePromise, refetchPromise]);
  } catch (error) {
    if (error instanceof LiveProfileBatchFailure) throw error;
    throw new LiveProfileBatchFailure("row-publish-response", "http-failed", input.rowOrdinal, input.completedRows);
  }
  if (!updateResponseObserved || !updateAccount(updated)) {
    throw new LiveProfileBatchFailure("row-publish-response", "contract-invalid", input.rowOrdinal, input.completedRows);
  }
  if (!rawAccount(refetched)) {
    throw new LiveProfileBatchFailure("row-publish-settle", "contract-invalid", input.rowOrdinal, input.completedRows);
  }
  if (refetched.documentId !== updated.documentId
      || !isDeepStrictEqual(refetched.social_media, updated.social_media)) {
    throw new LiveProfileBatchFailure("row-publish-settle", "state-mismatch", input.rowOrdinal, input.completedRows);
  }
  await profileBatchBoundary("row-publish-settle", "timeout", progress, input.waitForSavedTerminal);
  return refetched;
}
