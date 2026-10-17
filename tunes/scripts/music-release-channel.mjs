import { execFileSync } from "node:child_process";
import { fstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHANNEL_ARGUMENT = "--music-native-release-channel";
const CHANNEL_MODES = new Set(["qualification", "nightly", "rehearsal"]);
let nativeReleaseMode;

function hasNativeLauncherParent(mode) {
  try {
    if (process.platform === "win32") {
      const powershell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
      const query = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${process.ppid}';`+
        `@{ExecutablePath=$p.ExecutablePath;CommandLine=$p.CommandLine}|ConvertTo-Json -Compress`;
      const parent = JSON.parse(execFileSync(powershell, [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", query,
      ], { encoding: "utf8", windowsHide: true }));
      const launcher = fileURLToPath(new URL("./music-release-launcher.ps1", import.meta.url));
      const executableMatches = String(parent.ExecutablePath ?? "").toLowerCase() === powershell.toLowerCase();
      const command = String(parent.CommandLine ?? "");
      const escapedLauncher = launcher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return executableMatches && new RegExp(
        `(?:^|\\s)-File\\s+"?${escapedLauncher}"?\\s+-Mode\\s+${mode}(?:\\s|$)`, "i",
      ).test(command);
    }
    if (process.platform === "linux") {
      const executable = realpathSync(`/proc/${process.ppid}/exe`);
      if (!["dash", "bash", "sh"].includes(basename(executable))) return false;
      const argv = readFileSync(`/proc/${process.ppid}/cmdline`, "utf8").split("\0").filter(Boolean);
      if (argv.length !== 3 || argv[2] !== mode) return false;
      const launcher = fileURLToPath(new URL("./music-release-launcher.sh", import.meta.url));
      return resolve(argv[1]) === realpathSync(launcher);
    }
    return false;
  } catch {
    return false;
  }
}

const markerIndex = process.argv.lastIndexOf(CHANNEL_ARGUMENT);
if (markerIndex !== -1) {
  const mode = process.argv[markerIndex + 1];
  const nonce = process.argv[markerIndex + 2];
  const nodeAuthority = Object.keys(process.env).find((name) => /^NODE(?:_|$)/i.test(name));
  let channel = "";
  let channelIsAnonymous = false;
  try {
    const stat = fstatSync(0);
    channelIsAnonymous = process.platform === "win32"
      ? !stat.isFile() && !stat.isDirectory() && !stat.isCharacterDevice()
      : stat.isFIFO() || stat.isSocket();
    channel = readFileSync(0, "utf8").trim();
  } catch {
    channelIsAnonymous = false;
  }
  if (markerIndex !== process.argv.length - 3
      || !CHANNEL_MODES.has(mode)
      || !/^[a-f0-9]{64}$/.test(nonce ?? "")
      || nodeAuthority
      || !channelIsAnonymous
      || channel !== nonce
      || !hasNativeLauncherParent(mode)) {
    throw new Error("native Music release launcher attestation is invalid");
  }
  process.argv.splice(markerIndex, 3);
  nativeReleaseMode = mode;
}

export function requireNativeMusicReleaseLauncher(mode) {
  if (nativeReleaseMode !== mode) {
    throw new Error("native Music release launcher attestation is required");
  }
}
