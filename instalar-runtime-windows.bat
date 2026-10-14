@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo NavegaAI Professional - instalacao isolada do runtime
where py >nul 2>nul
if errorlevel 1 (echo ERRO: instale Python 3.11+ e habilite o launcher py. & pause & exit /b 1)
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
  if errorlevel 1 (echo ERRO ao criar ambiente virtual. & pause & exit /b 1)
)
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r runtime\requirements.txt
if errorlevel 1 (echo ERRO: dependencias nao instaladas. & pause & exit /b 1)
".venv\Scripts\python.exe" -m playwright install chromium
if errorlevel 1 (echo ERRO: Chromium do Playwright nao instalado. & pause & exit /b 1)
echo Instalacao concluida. Use iniciar-runtime-windows.bat.
pause
