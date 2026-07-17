@echo off
REM run.ps1 for Windows (PowerShell)
IF NOT DEFINED VIRTUAL_ENV (
  echo Activating venv
  .\.venv\Scripts\Activate.ps1
)
pip install -r requirements.txt
python backend\app.py
