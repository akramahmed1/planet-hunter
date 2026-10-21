"""The flattening window is a length of time, so a 20-second sector is not flattened over 5.6 hours."""
from pipeline.core import FLATTEN_SECONDS, flatten_window_length


def test_two_minute_data_keeps_the_original_1001_cadence_window():
    assert flatten_window_length(120) == 1001


def test_twenty_second_data_covers_the_same_hours():
    n = flatten_window_length(20)
    assert n % 2 == 1
    assert abs(n * 20 - FLATTEN_SECONDS) <= 40  # within one cadence of 33.4 hours


def test_window_never_collapses_for_slow_cadences():
    assert flatten_window_length(1800) >= 101
    assert flatten_window_length(1800) % 2 == 1
