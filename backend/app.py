from flask import Flask, request, jsonify
from core.athlete import Athlete
from core.sim import simulate_week
from backend.storage import save_athlete, load_athlete
import os

# Serve the frontend static files from the 'web' folder so there's no CORS issues.
app = Flask(__name__, static_folder='web', static_url_path='')

# Serve index.html at root
@app.route('/')
def index():
    return app.send_static_file('index.html')

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
    # Make sure working directory is repo root so paths are consistent
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/..')
    app.run(port=5000, debug=True)
