@echo off
REM ============================================================
REM   Wolf Pelt Analysis — Data Refresh
REM ============================================================
REM   Use this after editing wolves_data.xlsx:
REM     1. Edit the Excel file in Excel and save it
REM     2. Double-click this update.bat
REM     3. Wait for "Done" — the dashboard will reopen
REM ============================================================

cd /d "%~dp0"
set PY="C:\Users\nilim\AppData\Local\Programs\Python\Python310\python.exe"

echo.
echo ===== [1/5] Re-processing data =====
%PY% -X utf8 step2_process.py
if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR in step2_process.py — see message above.
  pause
  exit /b 1
)

echo.
echo ===== [2/5] Running audit (analysis pipeline verification) =====
%PY% -X utf8 step1c_audit.py > audit_summary.txt 2>&1
findstr /C:"ALL CHECKS PASSED" /C:"ISSUES FOUND" audit_summary.txt
if %ERRORLEVEL% neq 0 (
  echo   Audit complete — see audit_report.md for details.
)

echo.
echo ===== [3/5] Running data quality check (source-data verification) =====
%PY% -X utf8 step1d_dataqc.py
if %ERRORLEVEL% neq 0 (
  echo   Data QC encountered an error — see message above.
)
echo   Report: data_quality_report.md

echo.
echo ===== [4/5] Rebuilding analysis dashboard =====
%PY% -X utf8 step3_build_app.py
if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR in step3_build_app.py — see message above.
  pause
  exit /b 1
)

echo.
echo ===== [5/5] Rebuilding interactive data table =====
%PY% -X utf8 build_data_table.py
if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR in build_data_table.py — see message above.
  pause
  exit /b 1
)

echo.
echo ===== Done — opening data table and dashboard =====
start "" "data_table.html"
start "" "wolf_dashboard.html"
echo.
echo Press any key to close this window.
pause >nul
