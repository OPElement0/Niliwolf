@echo off
REM ============================================================
REM   Wolf Pelt Analysis — Publish to the public site
REM ============================================================
REM   Pushes the current wolves_data.xlsx + rebuilt dashboards to
REM   GitHub. GitHub Pages then refreshes the public view-only link
REM   within ~1-2 minutes:
REM     https://opelement0.github.io/Niliwolf/data_table.html
REM
REM   NOTE: You normally do NOT need this. Editing through the private
REM   cloud editor already commits to GitHub and CI rebuilds the site.
REM   Use publish.bat only after a LOCAL Excel edit + update.bat.
REM ============================================================
cd /d "%~dp0"

echo Staging data + dashboards...
git add wolves_data.xlsx data_table.html edit-7q2m9x4p.html index.html
git commit -m "Update wolf data + dashboards"
if %ERRORLEVEL% neq 0 (
  echo Nothing to commit ^(no changes^) or commit failed — see above.
)

echo.
echo Pushing to GitHub...
git push origin main
if %ERRORLEVEL% neq 0 (
  echo.
  echo Push failed — see message above.
  pause
  exit /b 1
)

echo.
echo Done. The public site will refresh shortly:
echo   https://opelement0.github.io/Niliwolf/data_table.html
echo.
pause >nul
