# Lesson content

One JSON file per lesson in `lessons/`, named `NN-<slug>.json`; the number sets the order.
The API copies these files into Postgres at startup (`learn/store.py`), so a lesson is
changed by editing its file in a pull request.

Rules, enforced by `tests/test_content.py` (the content lint):

- Every step lists the facts it states. Each fact has a source and at least one check:
  - `{"fixture": "<file>", "quote": "..."}`: the quoted words appear in the saved copy of the
    source in `tests/fixtures/external/` (or `repo:<path>` for this project's own files).
  - `{"computed": "<name>"}`: `learn/checks.py` computes the value from the site's datasets,
    and the result appears in the fact text.
- Every number in a step's body also appears in one of that step's facts.
- Quiz questions have an explanation, a source and a check. A numeric answer must match its
  check. A choice question has exactly one correct choice, and every choice explains itself.
- Links point to pages that exist. No em or en dashes. Results are candidates, never discoveries.
