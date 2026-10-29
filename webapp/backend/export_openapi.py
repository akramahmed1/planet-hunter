#!/usr/bin/env python3
"""Print the API's OpenAPI schema as JSON, without starting a server.

Used by the frontend's `npm run gen:types` (ADR 0002). Output is stable:
keys are sorted so the generated TypeScript only changes when the API does.
"""
import json
import sys

from app import app

json.dump(app.openapi(), sys.stdout, indent=2, sort_keys=True)
sys.stdout.write("\n")
