@echo off
chcp 65001 >nul
title Atualizar Riseframe
cd /d "%~dp0"

REM Descobre a pasta certa automaticamente:
REM - Se este .bat estiver DENTRO da pasta "riseframe" (tem web + server + package.json), sobe um nivel.
if exist "web\" if exist "server\" if exist "package.json" cd ..

REM Confirma que achamos o projeto (precisa existir a pasta riseframe\).
if not exist "riseframe\package.json" goto semrepo

echo.
echo ==========================================
echo    ATUALIZANDO O RISEFRAME
echo ==========================================
echo.

echo [1/5] Encerrando servidor anterior (porta 4000)...
REM Mata QUALQUER servidor antigo preso na porta 4000 (senao o novo nao sobe e o
REM app continua na versao velha). PowerShell e mais confiavel que o netstat.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul

echo [2/5] Baixando a versao mais nova...
REM Descarta mudancas locais em arquivos versionados (ex.: package-lock.json gerado
REM pelo npm) e forca a versao do master. Seus arquivos pessoais (.env, pasta data)
REM nao sao versionados, entao sao preservados.
git fetch origin master
if errorlevel 1 goto erro
git checkout -- . 2>nul
git reset --hard origin/master
if errorlevel 1 goto erro

cd riseframe

echo.
echo [3/5] Instalando dependencias...
call npm install
if errorlevel 1 goto erro

echo.
echo [4/5] Reconstruindo o app...
call npm run build
if errorlevel 1 goto erro

echo.
echo [5/5] Iniciando o servidor... (aguarde a linha "Riseframe v27 rodando")
REM Garante a porta livre uma segunda vez, imediatamente antes de subir.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul

echo.
echo ==========================================
echo    Abra no navegador:  http://localhost:4000
echo    NAO feche esta janela enquanto estiver usando.
echo ==========================================
echo.
call npm run start

echo.
echo (O servidor foi encerrado.)
pause
exit /b 0

:semrepo
echo.
echo ******************************************
echo   Nao encontrei a pasta do projeto.
echo   Coloque este arquivo dentro de:
echo     D:\Rise Creative\riseframe-app
echo   (ou dentro da pasta riseframe) e tente de novo.
echo ******************************************
echo.
pause
exit /b 1

:erro
echo.
echo ******************************************
echo   DEU UM ERRO. Tire um print desta tela
echo   inteira e me mande que eu resolvo.
echo ******************************************
echo.
pause
exit /b 1
