@echo off
cd /d "%~dp0"
start "WhatsApp Server" cmd /k "cd whatsapp-server && node index.js"
timeout /t 3
start "Proxy Server" cmd /k "npm run dev:server"
timeout /t 3
start "RiseFlow" cmd /k "npm run dev"
echo Servidores iniciados!
