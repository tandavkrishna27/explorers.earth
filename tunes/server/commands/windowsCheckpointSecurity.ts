import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export interface WindowsCheckpointSecurity {
  nativeDev: string;
  nativeIno: string;
  ownerMatchesEffectiveUser: boolean;
  unsafeWritePrincipalCount: number;
}

const windowsCheckpointSecurityHelper = resolve(import.meta.dirname, "../../scripts/windows-write-through.ps1");

function invalidWindowsCheckpointSecurity(): never {
  throw new Error("Music reconciliation resume refused: checkpoint file is insecure or invalid");
}

export function parseWindowsCheckpointSecurityOutput(
  output: string,
  expectedCount: number,
): WindowsCheckpointSecurity[] {
  const securities = output.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const parsed = JSON.parse(line) as Partial<WindowsCheckpointSecurity>;
    if (typeof parsed.nativeDev !== "string" || typeof parsed.nativeIno !== "string"
        || typeof parsed.ownerMatchesEffectiveUser !== "boolean"
        || typeof parsed.unsafeWritePrincipalCount !== "number") {
      invalidWindowsCheckpointSecurity();
    }
    return parsed as WindowsCheckpointSecurity;
  });
  if (securities.length !== expectedCount) invalidWindowsCheckpointSecurity();
  return securities;
}

export async function inspectWindowsCheckpointSecurities(paths: string[]): Promise<WindowsCheckpointSecurity[]> {
  const output = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-File", windowsCheckpointSecurityHelper, "inspect-security", ...paths],
    { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 },
  );
  return parseWindowsCheckpointSecurityOutput(output, paths.length);
}
