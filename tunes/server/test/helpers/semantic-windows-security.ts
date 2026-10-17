import { lstatSync } from "node:fs";
import type { WindowsSecretSecurityInspection } from "../../config/secure-music-secret-file";

export const semanticWindowsSecurityInspection: WindowsSecretSecurityInspection = (paths) => paths.map((path) => {
  const metadata = lstatSync(path, { bigint: true });
  return JSON.stringify({
    nativeDev: String(metadata.dev),
    nativeIno: String(metadata.ino),
    ownerMatchesEffectiveUser: true,
    unsafeWritePrincipalCount: 0,
  });
}).join("\n");
