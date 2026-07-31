@echo off
cd /d "%~dp0"
del /q "quartz\static\scare\_old-stairs.html"
git add -A
git commit -m "Scare page: replace with The Spade Turns build"
git push
(goto) 2>nul & del "%~f0"
