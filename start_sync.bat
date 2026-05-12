@echo off
REM ============================================================
REM   Wolf-Paper Sync Server
REM ============================================================
REM   One-click launcher for the local sync server.
REM   - Listens on http://127.0.0.1:7869
REM   - The admin page (data_table.html) auto-detects this server
REM     on load and switches to live-sync mode.
REM   - Edits go straight to wolves_data.xlsx / data_decisions.json.
REM   - Pipeline runs in the background after each save.
REM
REM   To stop: close this window or press Ctrl+C.
REM ============================================================
title Wolf-Paper Sync Server (Ctrl+C or close window to stop)
cd /d "%~dp0"
set PY="C:\Users\nilim\AppData\Local\Programs\Python\Python310\python.exe"

echo ============================================================
echo   Wolf-Paper Sync Server
echo ============================================================
echo   URL: http://127.0.0.1:7869
echo   Logs: %~dp0sync_server.log
echo   Backups: %~dp0.sync_backups\
echo.
echo   Keep this window open while editing in data_table.html.
echo   Close this window to stop the server.
echo ============================================================
echo.

%PY% -X utf8 sync_server.py

echo.
echo Server stopped. Press any key to close this window.
pause >nul
