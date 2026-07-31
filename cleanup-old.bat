@echo off
cd /d "%~dp0"
(
echo === attrib ===
attrib -r -h -s "quartz\static\scare\_old-stairs.html"
echo === del ===
del /f /q "quartz\static\scare\_old-stairs.html"
echo === git rm ===
git rm -f --ignore-unmatch "quartz/static/scare/_old-stairs.html"
echo === status ===
git status --short
echo === commit ===
git add -A
git commit -m "Remove superseded stairs build and helper script"
git push
echo === done ===
git log --oneline -1
) > cleanup-old.log 2>&1
