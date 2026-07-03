@echo off
cd /d "%~dp0"
echo Starting Vid Crop Tool at http://localhost:5500
python -m http.server 5500
pause