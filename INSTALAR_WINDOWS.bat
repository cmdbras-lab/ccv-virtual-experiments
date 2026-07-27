@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ==========================================
echo  CIENCIA EM MOVIMENTO 2.4.1 - INSTALACAO
echo ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  echo Instale uma versao LTS do Node.js e execute novamente.
  pause
  exit /b 1
)
for /f %%V in ('node -p "Number(process.versions.node.split('.')[0])"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 18 (
  echo ERRO: Node.js 18 ou superior e necessario.
  echo Versao detetada:
  node --version
  pause
  exit /b 1
)
echo A verificar a distribuicao executavel incluída...
node scripts\validate-runtime.mjs
if errorlevel 1 goto erro
echo.
echo Instalacao concluida sem descarregar dependencias.
echo Use EXECUTAR_DEMO_WINDOWS.bat para testar com o rato.
echo Use EXECUTAR_WINDOWS.bat para iniciar com a webcam.
pause
exit /b 0
:erro
echo.
echo A verificacao encontrou ficheiros em falta ou danificados.
echo Volte a descompactar o ZIP completo numa pasta nova.
pause
exit /b 1
