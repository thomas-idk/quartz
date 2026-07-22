@echo off
REM ============================================================
REM  One-shot publisher for the Quiet Garden theme reskin.
REM  - clears any stale git lock (left by an earlier tool session)
REM  - commits ALL current changes (theme code + home page)
REM  - pushes to origin/main  -> GitHub Pages rebuilds the site
REM  Output is written to publish-now.log
REM  Safe to delete this file after a successful publish.
REM ============================================================
cd /d "%~dp0"
if exist ".git\index.lock" del /f /q ".git\index.lock"
> publish-now.log echo === publish-now start ===
git add -A                                    1>> publish-now.log 2>&1
git commit -m "Quiet Garden theme reskin"     1>> publish-now.log 2>&1
git push origin main                          1>> publish-now.log 2>&1
echo === push exit code: %errorlevel% ===     1>> publish-now.log 2>&1
git rev-parse HEAD                             1>> publish-now.log 2>&1
echo.
echo Done. Result written to publish-now.log
echo.
pause
