@echo off
echo 出退勤管理システム を起動します...
echo ブラウザで http://localhost:3000 を開いてください
echo 停止するには Ctrl+C を押してください
echo.
cd /d "%~dp0"
pnpm dev
