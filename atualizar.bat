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

echo [1/4] Baixando a versao mais nova...
git pull origin master
if errorlevel 1 goto erro

cd riseframe

echo.
echo [2/4] Instalando dependencias...
call npm install
if errorlevel 1 goto erro

echo.
echo [3/4] Reconstruindo o app...
call npm run build
if errorlevel 1 goto erro

echo.
echo [4/4] Liberando a porta 4000 e iniciando o servidor...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo.
echo ==========================================
echo    PRONTO! O servidor esta rodando.
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
