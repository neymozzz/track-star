from dataclasses import dataclass, field
from typing import List, Dict, Any

@dataclass
class Athlete:
    name: str
    specialty: str  # 'sprint'|'distance'|'jumps'
    base_stat: float  # talent baseline
    form: float = 0.0
    fatigue: float = 0.0
    injuries: List[Dict[str, Any]] = field(default_factory=list)
    history: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self):
        return {
            'name': self.name,
            'specialty': self.specialty,
            'base_stat': self.base_stat,
            'form': self.form,
            'fatigue': self.fatigue,
            'injuries': self.injuries,
            'history': self.history,
        }

    @staticmethod
    def from_dict(d):
        a = Athlete(d['name'], d['specialty'], d['base_stat'])
        a.form = d.get('form', 0.0)
        a.fatigue = d.get('fatigue', 0.0)
        a.injuries = d.get('injuries', [])
        a.history = d.get('history', [])
        return a
