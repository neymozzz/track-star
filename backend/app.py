import os
from flask import Flask, request, jsonify, send_from_directory
from core.athlete import Athlete
from core.sim import simulate_week
from backend.storage import save_athlete, load_athlete

# Compute absolute path to the repo root and the web static folder so Flask can serve files correctly
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
WEB_DIR = os.path.join(BASE_DIR, 'web')

app = Flask(__name__, static_folder=WEB_DIR, static_url_path='')

# Serve index.html at root
@app.route('/')
def index():
    return send_from_directory(WEB_DIR, 'index.html')

@app.route('/create', methods=['POST'])
def create():
    data = request.json or {}
    name = data.get('name', 'Player')
    specialty = data.get('specialty', 'sprint')
    base = float(data.get('base_stat', 5.0))
    ath = Athlete(name, specialty, base)
    save_athlete(ath)
    return jsonify({'status': 'ok', 'athlete': ath.to_dict()})


@app.route('/week', methods=['POST'])
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


@app.route('/state', methods=['GET'])
def state():
    ath = load_athlete()
    if ath is None:
        return jsonify({'error': 'no athlete saved'}), 400
    return jsonify({'athlete': ath.to_dict()})


if __name__ == '__main__':
    # Change working directory to repo root so relative paths used elsewhere work as expected
    os.chdir(BASE_DIR)
    app.run(port=5000, debug=True)
