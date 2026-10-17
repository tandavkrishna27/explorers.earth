export function createDeletionCancellationCoordinator<T>(input: {
  cancelDeletion: () => Promise<T>;
  resumeMusic: () => Promise<unknown>;
}) {
  let cancelled: T | undefined;
  return {
    async cancelAndResume(): Promise<T> {
      cancelled ??= await input.cancelDeletion();
      await input.resumeMusic();
      const completed = cancelled;
      cancelled = undefined;
      return completed;
    },
  };
}

export async function deactivateExplorerAndMusic(input: {
  blockExplorer: () => Promise<boolean>;
  suspendMusic: () => Promise<unknown>;
  resumeMusic: () => Promise<unknown>;
}): Promise<void> {
  await input.suspendMusic();
  let blocked: boolean;
  try {
    blocked = await input.blockExplorer();
  } catch (failure) {
    await input.resumeMusic();
    throw failure;
  }
  if (blocked) return;
  await input.resumeMusic();
  throw new Error("Explorer account status update was not confirmed.");
}
