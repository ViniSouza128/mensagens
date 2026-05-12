@echo off
if "%RELAUNCHED%"=="" (
  set RELAUNCHED=1
  cmd /k "%~f0"
  exit /b
)

title Mensagens - iniciar dev
cd /d "%~dp0"

echo ===========================================
echo  Mensagens - inicializador de desenvolvimento
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
echo Iniciando servidor de desenvolvimento...
echo Abrindo http://localhost:3000 em 5 segundos...
echo (Ctrl+C para encerrar)
echo.

start /b cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3000"
npm run dev

echo.
echo Servidor encerrado.

:end
echo.
echo Pressione qualquer tecla para fechar...
pause >nul
