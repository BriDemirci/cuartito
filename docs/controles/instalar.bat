@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cuartito-ayudante.ps1" -Instalar
pause
