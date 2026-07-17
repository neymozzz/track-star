import random
from core.athlete import Athlete
from core.sim import simulate_week


def test_sim_basic():
    a = Athlete('Test', 'sprint', 5.0)
    res = simulate_week(a, training_load=30, attend_meet=False)
    assert 'week' in res['week']
    assert isinstance(a.fatigue, float)


if __name__ == '__main__':
    test_sim_basic()
    print('basic sim test passed')
