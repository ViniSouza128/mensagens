@echo off
if "%RELAUNCHED%"=="" (
  set RELAUNCHED=1
  cmd /k "%~f0"
  exit /b
)

title Mensagens - dev + tunnel
cd /d "%~dp0"

echo ===========================================
echo  Mensagens - dev + Cloudflare Tunnel
echo ===========================================
echo.

if exist ".next" (
  echo Limpando .next...
  rmdir /s /q ".next"
)

echo Limpando cache npm...
call npm cache clean --force >nul 2>&1

if exist "node_modules\.cache" (
  echo Limpando node_modules\.cache...
  rmdir /s /q "node_modules\.cache"
)

echo.
echo Liberando porta 3000 (encerrando processos existentes)...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo.
echo Instalando dependencias...
call npm install
if errorlevel 1 (
  echo.
  echo ERRO: npm install falhou.
  goto :end
)

echo.
echo Iniciando servidor dev em segundo plano (porta 3000)...
start "Mensagens Dev" /min cmd /c "npm run dev"

echo Aguardando servidor subir (8s)...
timeout /t 8 /nobreak >nul

echo.
echo Iniciando Cloudflare Tunnel...
echo (A URL publica sera aberta automaticamente no navegador)
echo (Ctrl+C para encerrar tudo)
echo.

set "PS_TMP=%TEMP%\mensagens_tunnel_%RANDOM%.ps1"

powershell -NoProfile -Command "[System.IO.File]::WriteAllText('%PS_TMP%', [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('JG8gPSAkZmFsc2UKY2xvdWRmbGFyZWQgdHVubmVsIC0tdXJsIGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCAyPiYxIHwgRm9yRWFjaC1PYmplY3QgewogICAgJGwgPSAkXy5Ub1N0cmluZygpCiAgICBXcml0ZS1Ib3N0ICRsCiAgICBpZiAoLW5vdCAkbyAtYW5kICRsIC1tYXRjaCAnaHR0cHM6Ly9cUytcLnRyeWNsb3VkZmxhcmVcLmNvbScpIHsKICAgICAgICAkdXJsID0gJE1hdGNoZXNbMF0KICAgICAgICBXcml0ZS1Ib3N0ICIiCiAgICAgICAgV3JpdGUtSG9zdCAiQWJyaW5kbzogJHVybCIgLUZvcmVncm91bmRDb2xvciBHcmVlbgogICAgICAgIFN0YXJ0LVByb2Nlc3MgJHVybAogICAgICAgICRvID0gJHRydWUKICAgIH0KfQ==')))"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_TMP%"
del "%PS_TMP%" >nul 2>&1

echo.
echo Tunnel encerrado.

:end
echo.
echo Pressione qualquer tecla para fechar...
pause >nul
