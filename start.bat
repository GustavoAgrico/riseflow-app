@echo off
title RiseFlow — Iniciando servicos...
echo.
echo  ██████╗ ██╗███████╗███████╗███████╗██╗      ██████╗ ██╗    ██╗
echo  ██╔══██╗██║██╔════╝██╔════╝██╔════╝██║     ██╔═══██╗██║    ██║
echo  ██████╔╝██║███████╗█████╗  █████╗  ██║     ██║   ██║██║ █╗ ██║
echo  ██╔══██╗██║╚════██║██╔══╝  ██╔══╝  ██║     ██║   ██║██║███╗██║
echo  ██║  ██║██║███████║███████╗██║     ███████╗╚██████╔╝╚███╔███╔╝
echo  ╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝
echo.

:: WhatsApp Server — porta 3334
echo [1/3] Iniciando WhatsApp Server (porta 3334)...
start "RiseFlow — WhatsApp :3334" cmd /k "cd /d "%~dp0whatsapp-server" && node index.js"
timeout /t 2 /nobreak >nul

:: Backend Proxy — porta 3333
echo [2/3] Iniciando Backend Proxy (porta 3333)...
start "RiseFlow — Backend Proxy :3333" cmd /k "cd /d "%~dp0server" && node index.js"
timeout /t 2 /nobreak >nul

:: Frontend Vite — porta 3001
echo [3/3] Iniciando Frontend Vite (porta 3001)...
start "RiseFlow — Frontend :3001" cmd /k "cd /d "%~dp0" && npm run dev"

echo.
echo  Abrindo o browser em 5 segundos...
timeout /t 5 /nobreak >nul
start http://localhost:3001

echo.
echo  Todos os servicos iniciados! Pode fechar esta janela.
echo  Para parar, feche as 3 janelas de terminal abertas.
pause
