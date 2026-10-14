@echo off
cd /d "%~dp0"
echo ===================================================
echo   NavegaAI - Ponte para BrowserOS neo via MCP
echo ===================================================
echo.
echo O BrowserOS neo deve estar aberto.
echo Este script requer Node.js 20 ou superior.
echo.
node bridge.mjs
if errorlevel 1 echo Nao foi possivel iniciar. Instale Node.js 20+ e confira a porta do neo.
pause
