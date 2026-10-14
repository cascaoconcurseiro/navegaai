@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Runtime nao instalado. Execute instalar-runtime-windows.bat primeiro.
  pause
  exit /b 1
)
echo NavegaAI Runtime - somente 127.0.0.1. Nao compartilhe o token de acesso.
echo Mantenha esta janela aberta para execucoes em andamento.
".venv\Scripts\python.exe" -m runtime.server
if errorlevel 1 (echo Runtime encerrado com erro. Consulte a auditoria e nao repita acoes sensiveis. & pause)
