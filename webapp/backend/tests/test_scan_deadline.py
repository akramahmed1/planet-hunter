"""A stalled MAST search must fail as retryable instead of using the whole scan budget."""
import sys
import threading
import time
import types

import pytest

from scans import run


def test_with_deadline_returns_raises_and_gives_up():
    assert run._with_deadline(lambda: 42, 1, "x") == 42
    with pytest.raises(ValueError, match="bad"):
        run._with_deadline(lambda: (_ for _ in ()).throw(ValueError("bad")), 1, "x")
    release = threading.Event()
    t0 = time.monotonic()
    with pytest.raises(TimeoutError, match="MAST search gave no answer in 0.2 s"):
        run._with_deadline(release.wait, 0.2, "MAST search")
    assert time.monotonic() - t0 < 2
    release.set()


def test_a_stalled_search_is_retried_then_reported_as_transient(monkeypatch):
    calls = []
    release = threading.Event()

    def stalled_search(*args, **kwargs):
        calls.append(args)
        release.wait(30)  # like a MAST request that never answers

    monkeypatch.setitem(sys.modules, "lightkurve", types.SimpleNamespace(search_lightcurve=stalled_search))
    monkeypatch.setattr(run, "SEARCH_TIMEOUT_S", 0.2)
    monkeypatch.setattr(run.time, "sleep", lambda s: None)  # skip the pauses between attempts
    try:
        with pytest.raises(run.Transient, match="MAST search failed: TimeoutError"):
            run.scan(260128333, run.PRESETS["standard"])
        assert len(calls) == 4
    finally:
        release.set()
