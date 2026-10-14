import sys
from pathlib import Path

# Make the backend modules importable as top-level modules, like in the container.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
