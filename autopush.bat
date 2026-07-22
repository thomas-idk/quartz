@echo off
REM Hourly auto-publish, now with backup + auto-heal protection.
REM (Safety) clear any stale git lock left by an interrupted process, so the
REM hourly publish never silently stalls on a leftover .git\index.lock.
if exist "%~dp0.git\index.lock" del /f /q "%~dp0.git\index.lock"
REM All the real logic lives in publish-guard.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-guard.ps1"
