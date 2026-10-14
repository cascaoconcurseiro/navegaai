@echo off
cd /d "%~dp0"
echo Abra http://127.0.0.1:8765/site-teste.html no Chrome
python -m http.server 8765 --bind 127.0.0.1
pause
