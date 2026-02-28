@echo off
echo ======================================
echo   PULSE Social Media - Frontend
echo ======================================
echo.

REM Check if Python is installed
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Python is installed
    echo Starting web server on http://localhost:8080
    echo.
    echo Open your browser and go to: http://localhost:8080/index-vanilla.html
    echo.
    echo Press Ctrl+C to stop the server
    echo.
    python -m http.server 8080
    goto :end
)

REM If Python not found, try Node.js http-server
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Node.js is installed
    echo Installing http-server...
    call npm install -g http-server
    echo.
    echo Starting web server on http://localhost:8080
    echo.
    echo Open your browser and go to: http://localhost:8080/index-vanilla.html
    echo.
    echo Press Ctrl+C to stop the server
    echo.
    http-server -p 8080
    goto :end
)

REM If neither Python nor Node.js found
echo [INFO] No web server found
echo.
echo OPTION 1: Just open the HTML file directly
echo Right-click on "index-vanilla.html" and choose "Open with" > Your browser
echo.
echo OPTION 2: Install Python or Node.js
echo - Python: https://www.python.org/downloads/
echo - Node.js: https://nodejs.org/
echo.
pause
exit /b 0

:end
pause
