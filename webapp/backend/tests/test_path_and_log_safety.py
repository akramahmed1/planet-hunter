"""CodeQL flagged the light curve loader (path built from the slug) and a Stripe log line (values from the request)."""
import pytest
from fastapi import HTTPException

from api_v2 import phase5_routes, phase9_routes


@pytest.mark.parametrize("bad", ["../x", "a/../../etc/passwd", "/etc/passwd", "..", "toi-700/../../x"])
def test_light_curve_loader_refuses_a_slug_that_leaves_the_folder(bad):
    with pytest.raises(HTTPException) as err:
        phase5_routes._load(bad)
    assert err.value.status_code == 404


def test_log_values_cannot_break_a_log_line():
    assert phase9_routes._one_line("evt_1\r\nFAKE entry") == "evt_1FAKE entry"
    assert phase9_routes._one_line({"a": 1}) == "{'a': 1}"
