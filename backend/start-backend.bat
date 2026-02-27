@echo off
echo ======================================
echo   PULSE Social Media - Backend
echo ======================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Download the LTS version and run the installer.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js is installed: 
node --version
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo [ERROR] Please run this script from the backend directory
    echo.
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing backend dependencies...
    echo This may take a minute...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed successfully!
    echo.
)

echo Starting backend server...
echo.
echo Backend will run on: http://localhost:3001
echo API available at: http://localhost:3001/api
echo.
echo Press Ctrl+C to stop the server
echo.
echo ======================================
echo.

node server.js

pause
