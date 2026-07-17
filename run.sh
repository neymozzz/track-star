#!/bin/bash
# run.sh — start a local dev server (venv must be created)
set -e
. .venv/bin/activate
pip install -r requirements.txt
python backend/app.py
