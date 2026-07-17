import os
import sys
from flask import Flask, request, jsonify, send_from_directory, send_file
from core.athlete import Athlete
from core.sim import simulate_week
from backend.storage import save_athlete, load_athlete

# Resolve base dir so static files work whether run normally, inside Docker, or when bundled with PyInstaller
if getattr(sys, '_MEIPASS', None):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
WEB_DIR = os.path.join(BASE_DIR, 'web')

app = Flask(__name__, static_folder=None)

# --- API routes (prefix with /api) ---
@app.route('/api/create', methods=['POST'])
def create():
    data = request.json or {}
    name = data.get('name', 'Player')
    specialty = data.get('specialty', 'sprint')
    base = float(data.get('base_stat', 5.0))
    ath = Athlete(name, specialty, base)
    save_athlete(ath)
    return jsonify({'status': 'ok', 'athlete': ath.to_dict()})


@app.route('/api/week', methods=['POST'])
def week():
    data = request.json or {}
    training = int(data.get('training_load', 30))
    attend = bool(data.get('attend_meet', False))
    ath = load_athlete()
    if ath is None:
        return jsonify({'error': 'no athlete saved'}), 400
    res = simulate_week(ath, training, attend)
    save_athlete(ath)
    return jsonify({'status': 'ok', 'result': res, 'athlete': ath.to_dict()})


@app.route('/api/state', methods=['GET'])
def state():
    ath = load_athlete()
    if ath is None:
        return jsonify({'error': 'no athlete saved'}), 400
    return jsonify({'athlete': ath.to_dict()})


# --- Static file serving ---
@app.route('/')
def index():
    index_path = os.path.join(WEB_DIR, 'index.html')
    if os.path.exists(index_path):
        return send_file(index_path)
    return 'index.html not found', 404


@app.route('/<path:filename>')
def serve_file(filename):
    file_path = os.path.join(WEB_DIR, filename)
    if os.path.exists(file_path):
        return send_from_directory(WEB_DIR, filename)
    return 'Not found', 404


if __name__ == '__main__':
    # Ensure working dir is repo root
    os.chdir(BASE_DIR)
    port = int(os.environ.get('PORT', '5000'))
    debug = os.environ.get('DEBUG', 'False').lower() in ('1', 'true', 'yes')
    app.run(host='0.0.0.0', port=port, debug=debug)
