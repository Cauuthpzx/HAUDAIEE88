@echo off
title EE88 Agent Hub (Dev)
echo.
echo === EE88 Agent Hub — Dev Mode ===
echo.

cd /d "%~dp0Project_EE88\server"

if not exist "node_modules" (
    echo [*] Cai dat dependencies...
    call npm install
    echo.
)

echo [*] Khoi dong dev server (auto-reload)...
echo.
npx nodemon server.js
pause
