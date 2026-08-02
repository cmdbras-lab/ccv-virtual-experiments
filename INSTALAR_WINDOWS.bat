@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ==========================================
echo  CIENCIA EM MOVIMENTO 3.0.6 - VERIFICACAO
ECHO ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  echo Instale a versao LTS de https://nodejs.org e execute novamente.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo ERRO: pasta dist em falta.
  pause
  exit /b 1
)
node scripts\validate-runtime.mjs
if errorlevel 1 goto erro
echo.
echo Pacote validado. Use EXECUTAR_WINDOWS.bat.
pause
exit /b 0
:erro
echo.
echo O pacote nao passou a verificacao local.
pause
exit /b 1
