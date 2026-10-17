@echo off
setlocal DisableDelayedExpansion
set NODE >nul 2>&1
if not errorlevel 1 goto reject_node_authority
"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0music-release-launcher.ps1" -Mode "%~1"
exit /b %ERRORLEVEL%

:reject_node_authority
>&2 echo native Music release launcher rejected Node startup authority
exit /b 78
