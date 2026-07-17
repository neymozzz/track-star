import random
from typing import Dict, Any
from core.athlete import Athlete


def injury_roll(ath: Athlete, training_load: int) -> Dict[str, Any]:
    injury_base = 0.01
    injury_from_load = max(0.0, (training_load - 60) * 0.0015)
    injury_chance = injury_base + injury_from_load + ath.fatigue * 0.001
    got = random.random() < injury_chance
    if not got:
        return {'injured': False}
    severity = random.choices(['minor', 'major'], weights=[0.8, 0.2])[0]
    return {'injured': True, 'severity': severity}


def compute_performance(ath: Athlete) -> float:
    noise = random.gauss(0, 1.0)
    perf = ath.base_stat + ath.form - (ath.fatigue * 0.02) + noise
    return perf


def world_event_roll(ath: Athlete) -> Dict[str, Any]:
    if random.random() < 0.1:
        ev = random.choice(['heat_wave', 'good_weather', 'rival_breaks_record'])
        if ev == 'heat_wave':
            ath.fatigue += 10
        elif ev == 'good_weather':
            ath.form += 1
        return {'event': ev}
    return {'event': None}


def simulate_week(ath: Athlete, training_load: int, attend_meet: bool) -> Dict[str, Any]:
    # training_load: 0..100
    fatigue_gain = training_load * 0.1
    recovery = max(5, 20 - training_load * 0.05)

    ath.fatigue += fatigue_gain
    ath.fatigue = max(0.0, ath.fatigue - recovery)

    inj = injury_roll(ath, training_load)
    injury_info = None
    if inj['injured']:
        severity = inj['severity']
        ath.injuries.append({'week': len(ath.history) + 1, 'severity': severity})
        injury_info = severity
        if severity == 'major':
            ath.fatigue += 30
            ath.form -= 10

    meet_result = None
    if attend_meet:
        perf = compute_performance(ath)
        placing = max(1, int(10 - perf))
        meet_result = {'perf': round(perf, 2), 'placing': placing}
        ath.form += max(-2, 1 - ath.fatigue * 0.01)

    world_ev = world_event_roll(ath)

    week_record = {
        'week': len(ath.history) + 1,
        'training_load': training_load,
        'attended': attend_meet,
        'injured': inj['injured'],
        'injury_severity': inj.get('severity'),
        'meet_result': meet_result,
        'world_event': world_ev.get('event')
    }
    ath.history.append(week_record)

    state = {'form': ath.form, 'fatigue': ath.fatigue, 'injuries': ath.injuries}
    return {'week': week_record, 'state': state}
