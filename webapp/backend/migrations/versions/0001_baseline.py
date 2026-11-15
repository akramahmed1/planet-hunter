"""Baseline: empty schema. Later phases add tables on top of this revision.

Revision ID: 0001
Revises:
Create Date: 2026-10-17
"""
from __future__ import annotations

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
