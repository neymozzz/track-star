# build_exe.ps1 — build a single-file Windows executable with PyInstaller
# Run from the repository root in PowerShell.

# Activate venv if present
if (Test-Path ".\.venv\Scripts\Activate.ps1") {
  Write-Host "Activating virtual environment..."
  . .\.venv\Scripts\Activate.ps1
}

Write-Host "Installing Python requirements..."
pip install -r requirements.txt

Write-Host "Installing PyInstaller..."
pip install pyinstaller

Write-Host "Running PyInstaller (this may take a minute)..."
# Include web/ and backend_data/ directories so the bundled app can read static files and save data
pyinstaller --noconfirm --onefile --add-data "web;web" --add-data "backend_data;backend_data" --name TrackStar launcher.py

Write-Host "Build finished. Executable is in the dist\TrackStar.exe"
