import sys
from pathlib import Path

# Make the backend modules importable as top-level modules, like in the container.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Classroom is off unless switched on (CLASSROOM_ENABLED); the test suite exercises it, so it runs with the
# switch on. tests/test_classroom_flag.py turns it off per test to prove the off state.
import os  # noqa: E402

os.environ.setdefault("CLASSROOM_ENABLED", "1")
# test_v2 reads /openapi.json; tests/test_docs_off.py proves the default (off) separately.
os.environ.setdefault("API_DOCS", "1")
