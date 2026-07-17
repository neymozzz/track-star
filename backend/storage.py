import json
from pathlib import Path
from core.athlete import Athlete

STORE = Path('backend_data')
STORE.mkdir(parents=True, exist_ok=True)
SAVE_FILE = STORE / 'save.json'


def save_athlete(ath: Athlete):
    with SAVE_FILE.open('w', encoding='utf-8') as f:
        json.dump(ath.to_dict(), f, ensure_ascii=False, indent=2)


def load_athlete() -> Athlete:
    if not SAVE_FILE.exists():
        return None
    with SAVE_FILE.open('r', encoding='utf-8') as f:
        d = json.load(f)
    return Athlete.from_dict(d)
