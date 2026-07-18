@echo off
REM build_exe.bat — Windows batch helper to build the EXE with PyInstaller
IF EXIST .venv\Scripts\activate.bat (
  echo Activating venv...
  call .venv\Scripts\activate.bat
)

echo Installing requirements...
pip install -r requirements.txt

echo Installing PyInstaller...
pip install pyinstaller

echo Building EXE (this may take a minute)...
pyinstaller --noconfirm --onefile --add-data "web;web" --add-data "backend_data;backend_data" --name TrackStar launcher.py

echo Build finished. Check dist\TrackStar.exe
pause
