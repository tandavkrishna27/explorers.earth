export type KeyValuePair = { [key: string]: any };

export type SaveTerminalStatus = "saved" | "failed" | "cancelled";

export type ProfileSaveResult =
  | { status: "saved" }
  | { status: "failed" }
  | { status: "deferred"; completion: Promise<SaveTerminalStatus> };

export type ProfileSubmit = (
  values: KeyValuePair,
) => Promise<ProfileSaveResult>;

export interface DeferredProfileSave {
  result: Extract<ProfileSaveResult, { status: "deferred" }>;
  settle: (status: SaveTerminalStatus) => void;
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

  return {
    result: { status: "deferred", completion },
    settle: (status) => {
      if (settled) return;
      settled = true;
      resolveCompletion(status);
    },
  };
}
