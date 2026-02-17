@echo off
title EE88 Agent Hub
echo.
echo === EE88 Agent Hub ===
echo.

cd /d "%~dp0server"

if not exist "node_modules" (
    echo [*] Cai dat dependencies...
    call npm install
    echo.
)

if not exist ".env" (
    echo [!] Chua co file .env
    echo [!] Hay copy .env.example thanh .env va dien gia tri thuc
    echo.
    pause
    exit /b 1
)

echo [*] Khoi dong server...
echo.
node server.js
pause
