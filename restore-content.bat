@echo off
cd /d C:\Users\Me1Io\Desktop\quartz
echo ============================================
echo   Restoring notes removed by phone sync
echo ============================================
echo.
echo [1/5] Fetching latest state from GitHub...
git fetch origin
echo.
echo [2/5] Moving branch pointer to GitHub's version
echo       (your files on disk are NOT touched)...
git reset --soft origin/main
echo.
echo [3/5] Re-staging all your content from disk...
git add -A
echo.
echo [4/5] Committing the restore...
git commit -m "Restore notes removed by phone vault sync"
echo.
echo [5/5] Pushing to GitHub (site will rebuild)...
git push
echo.
echo ============================================
echo   Done. Your notes are pushed back.
echo   The site rebuilds in about 2-3 minutes.
echo ============================================
echo.
pause
