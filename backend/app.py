import os
from flask import Flask, request, jsonify, send_from_directory, send_file
from core.athlete import Athlete
from core.sim import simulate_week
from backend.storage import save_athlete, load_athlete

# Compute absolute path to the repo root and the web static folder so Flask can serve files correctly
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
WEB_DIR = os.path.join(BASE_DIR, 'web')

# Debug info
print('DEBUG: BASE_DIR=', BASE_DIR)
print('DEBUG: WEB_DIR=', WEB_DIR)
print('DEBUG: index exists at startup=', os.path.exists(os.path.join(WEB_DIR, 'index.html')))

# Disable Flask's built-in static folder handling; we'll serve files explicitly at the end
app = Flask(__name__, static_folder=None)

# API routes (prefix with /api to avoid conflicts with static paths)
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

# Serve index.html at root
@app.route('/')
def index():
    index_path = os.path.join(WEB_DIR, 'index.html')
    print(f"DEBUG: request for /, resolved index_path={index_path}, exists={os.path.exists(index_path)}")
    if os.path.exists(index_path):
        return send_file(index_path)
    return 'index.html not found', 404

# Serve any other static file under web/ (e.g., /index.html, /app.js, /styles.css, /static/...)
@app.route('/<path:filename>')
def serve_file(filename):
    file_path = os.path.join(WEB_DIR, filename)
    print(f"DEBUG: request for /{filename}, resolved file_path={file_path}, exists={os.path.exists(file_path)}")
    if os.path.exists(file_path):
        return send_from_directory(WEB_DIR, filename)
    return 'Not found', 404


if __name__ == '__main__':
    # Change working directory to repo root so relative paths used elsewhere work as expected
    os.chdir(BASE_DIR)
    app.run(port=5000, debug=True)
