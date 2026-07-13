@echo off
REM Hourly auto-publish, now with backup + auto-heal protection.
REM All the real logic lives in publish-guard.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-guard.ps1"
