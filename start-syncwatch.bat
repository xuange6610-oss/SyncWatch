@echo off
setlocal
title SyncWatch同步观影 - 开发备用启动
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js 22 或更高版本。
  echo 正式用户请下载 GitHub Releases 中的 Windows 服务器 EXE；本脚本仅供开发者使用。
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if not defined NODE_MAJOR set NODE_MAJOR=0
if %NODE_MAJOR% LSS 22 (
  echo [错误] 当前 Node.js 版本过旧，需要 Node.js 22 或更高版本。
  pause
  exit /b 1
)

if not exist node_modules\electron\package.json (
  echo [初始化] 正在安装锁定依赖，请稍候...
  call npm ci --no-fund
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络或 package-lock.json。
    pause
    exit /b 1
  )
)

echo [启动] 正在打开 SyncWatch同步观影...
call npm start
endlocal
