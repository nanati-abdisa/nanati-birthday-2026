@echo off
title Nanati's Birthday Celebration Server
color 0E
cd /d "%~dp0"

echo ========================================================
echo    NANATI'S BIRTHDAY CELEBRATION WEBSITE
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [PROBLEM] Node.js is not installed on this computer.
  echo.
  echo  1. Go to https://nodejs.org
  echo  2. Download the LTS version and install it ^(click Next, Next...^)
  echo  3. Close this window and double-click start.bat again.
  echo.
  pause
  exit /b 1
)

echo Node.js version:
node -v
echo.

if not exist node_modules (
  echo Installing for the first time - please wait...
  call npm install
  echo.
)

echo --------------------------------------------------------
echo  KEEP THIS WINDOW OPEN while people use the website.
echo.
echo  Your birthday page :  http://localhost:3000
echo  Your private lounge:  http://localhost:3000/admin.html
echo --------------------------------------------------------
echo.

REM open the browser a few seconds AFTER the server starts
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000/admin.html"

node --no-warnings server/server.js

echo.
echo The server stopped. If you see a red message above, take a photo of it and send it to me.
pause
