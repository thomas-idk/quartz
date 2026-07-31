@echo off
cd /d "%~dp0"
del /q "quartz\static\scare\_test.html"
git add -A
git commit -m "Remove temporary 12-line verification copy"
git push
(goto) 2>nul & del "%~f0"
