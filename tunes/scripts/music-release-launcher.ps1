param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("qualification", "rehearsal")]
  [string]$Mode
)

$ErrorActionPreference = "Stop"
$rejectedMessage = "native Music release launcher rejected Node startup authority"
if (Get-ChildItem Env: | Where-Object { $_.Name -match '^NODE(?:_|$)' }) {
  [Console]::Error.WriteLine($rejectedMessage)
  exit 78
}

Import-Module -Name "C:\Windows\System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1" -Force
Import-Module -Name "C:\Windows\System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1" -Force

$scriptRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $scriptRoot "..\.."))
$nodePath = "C:\Program Files\nodejs\node.exe"
$gitPath = "C:\Program Files\Git\cmd\git.exe"
$channelPath = Join-Path $scriptRoot "music-release-channel.mjs"
$registerPath = Join-Path $scriptRoot "music-native-typescript-register.mjs"
$resolverPath = Join-Path $scriptRoot "music-native-typescript-loader.mjs"
$targetPath = if ($Mode -eq "qualification") {
  Join-Path $scriptRoot "music-cli.ts"
} else {
  Join-Path $scriptRoot "music-docker-release-rehearsal.ts"
}

function Get-NativeAuthority([string]$Path, [string]$SignatureSubject = "") {
  $fullPath = [IO.Path]::GetFullPath($Path)
  if (-not [IO.File]::Exists($fullPath)) { throw "trusted native release authority is unavailable" }
  $item = Get-Item -LiteralPath $fullPath -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "trusted native release authority cannot be a reparse point"
  }
  if ($SignatureSubject) {
    $signature = Get-AuthenticodeSignature -LiteralPath $fullPath
    if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch $SignatureSubject) {
      throw "trusted native executable authority has an invalid signature"
    }
  }
  return [PSCustomObject]@{
    Path = $fullPath
    Length = $item.Length
    Digest = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash
    SignatureSubject = $SignatureSubject
  }
}

$authorities = @(
  Get-NativeAuthority $nodePath "OpenJS Foundation"
  Get-NativeAuthority $gitPath "Johannes Schindelin"
  Get-NativeAuthority $channelPath
  Get-NativeAuthority $registerPath
  Get-NativeAuthority $resolverPath
  Get-NativeAuthority $targetPath
)

$nodeVersionLines = @(& $nodePath --version 2>$null)
if ($LASTEXITCODE -ne 0 -or $nodeVersionLines.Count -ne 1 -or [string]$nodeVersionLines[0] -cne "v24.21.0") {
  [Console]::Error.WriteLine("trusted native Node version must be exactly v24.21.0")
  exit 78
}

$preserved = @{}
foreach ($key in @(
  "MUSIC_C10_STANDALONE_POSTGRES_ACK",
  "MUSIC_C10_STANDALONE_POSTGRES_PORT",
  "MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID",
  "MUSIC_C10_STANDALONE_POSTGRES_COMMIT"
)) {
  $value = [Environment]::GetEnvironmentVariable($key, "Process")
  if (-not [string]::IsNullOrEmpty($value)) { $preserved[$key] = $value }
}

$userProfile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
$localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$temporaryRoot = Join-Path $localAppData "Temp"
if (-not [IO.Directory]::Exists($userProfile) -or -not [IO.Directory]::Exists($temporaryRoot)) {
  throw "canonical native release user directories are unavailable"
}
$emptyGlobalNpmConfig = "C:\Windows\System32\config\systemprofile\music-release-empty.npmrc"
if ([IO.File]::Exists($emptyGlobalNpmConfig)) {
  throw "trusted empty npm global configuration authority is unavailable"
}

foreach ($key in @([Environment]::GetEnvironmentVariables("Process").Keys)) {
  [Environment]::SetEnvironmentVariable([string]$key, $null, "Process")
}
$minimalEnvironment = @{
  "SystemRoot" = "C:\Windows"
  "WINDIR" = "C:\Windows"
  "ComSpec" = "C:\Windows\System32\cmd.exe"
  "ProgramFiles" = "C:\Program Files"
  "ProgramW6432" = "C:\Program Files"
  "PATHEXT" = ".COM;.EXE;.BAT;.CMD"
  "PATH" = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;C:\Program Files\Docker\Docker\resources\bin;C:\Windows\System32\WindowsPowerShell\v1.0;C:\Windows\System32;C:\Windows"
  "HOME" = $userProfile
  "USERPROFILE" = $userProfile
  "LOCALAPPDATA" = $localAppData
  "TEMP" = $temporaryRoot
  "TMP" = $temporaryRoot
  "LANG" = "C"
  "LC_ALL" = "C"
  "NPM_CONFIG_USERCONFIG" = "NUL"
  "NPM_CONFIG_GLOBALCONFIG" = $emptyGlobalNpmConfig
  "NPM_CONFIG_AUDIT" = "false"
  "NPM_CONFIG_FUND" = "false"
  "NPM_CONFIG_UPDATE_NOTIFIER" = "false"
}
foreach ($entry in $minimalEnvironment.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
}
foreach ($entry in $preserved.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
}
Set-Location -LiteralPath $repositoryRoot

$gitEnvironment = @{
  "GIT_CONFIG_NOSYSTEM" = "1"
  "GIT_CONFIG_GLOBAL" = "NUL"
  "GIT_CONFIG_SYSTEM" = "NUL"
  "GIT_ATTR_NOSYSTEM" = "1"
  "GIT_OPTIONAL_LOCKS" = "0"
  "GIT_TERMINAL_PROMPT" = "0"
  "GIT_PAGER" = ""
}
foreach ($entry in $gitEnvironment.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
}
$gitArguments = @(
  "--no-replace-objects", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false",
  "-c", "diff.external=", "status", "--porcelain=v1", "--untracked-files=all"
)
$sourceStatus = & $gitPath @gitArguments
if ($LASTEXITCODE -ne 0 -or $sourceStatus) { throw "native release source checkout must be clean" }
foreach ($key in $gitEnvironment.Keys) {
  [Environment]::SetEnvironmentVariable($key, $null, "Process")
}

$random = New-Object byte[] 32
$generator = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $generator.GetBytes($random) } finally { $generator.Dispose() }
$nonce = -join ($random | ForEach-Object { $_.ToString("x2") })
$channelUri = ([Uri]$channelPath).AbsoluteUri
$registerUri = ([Uri]$registerPath).AbsoluteUri
$arguments = @(
  "--no-warnings=ExperimentalWarning",
  "--experimental-transform-types",
  "--import", $channelUri,
  "--import", $registerUri,
  $targetPath
)
if ($Mode -eq "qualification") { $arguments += @("test:release", "--format", "json") }
$arguments += @("--music-native-release-channel", $Mode, $nonce)

$nonce | & $nodePath @arguments
$nodeExitCode = $LASTEXITCODE
foreach ($authority in $authorities) {
  $current = Get-NativeAuthority $authority.Path $authority.SignatureSubject
  if ($current.Length -ne $authority.Length -or $current.Digest -ne $authority.Digest) {
    [Console]::Error.WriteLine("trusted native release authority changed during execution")
    exit 78
  }
}
exit $nodeExitCode
