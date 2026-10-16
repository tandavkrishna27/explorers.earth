export type KeyValuePair = { [key: string]: any };

export type SaveTerminalStatus = "saved" | "failed" | "cancelled";

export type ProfileSaveResult =
  | { status: "saved"; committedRevision?: number }
  | { status: "failed" }
  | { status: "deferred"; completion: Promise<SaveTerminalStatus>; committedRevision?: number };

export type ProfileSubmit = (
  values: KeyValuePair,
) => Promise<ProfileSaveResult>;

export interface DeferredProfileSave {
  result: Extract<ProfileSaveResult, { status: "deferred" }>;
  settle: (status: SaveTerminalStatus, committedRevision?: number) => void;
}

export const awaitProfileSaveTerminal = async (
  result: ProfileSaveResult,
): Promise<SaveTerminalStatus> =>
  result.status === "deferred" ? result.completion : result.status;

export function createDeferredProfileSave(): DeferredProfileSave {
  let resolveCompletion: (status: SaveTerminalStatus) => void = () => undefined;
  let settled = false;
  const completion = new Promise<SaveTerminalStatus>((resolve) => {
    resolveCompletion = resolve;
  });

  const result: DeferredProfileSave["result"] = { status: "deferred", completion };
  return {
    result,
    settle: (status, committedRevision) => {
      if (settled) return;
      settled = true;
      if (status === "saved") result.committedRevision = committedRevision;
      resolveCompletion(status);
    },
  };
}
