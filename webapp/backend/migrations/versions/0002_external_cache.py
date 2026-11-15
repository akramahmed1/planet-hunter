"""external_cache: last good copy of every upstream response (Phase 2).

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "external_cache",
        sa.Column("key", sa.String(255), primary_key=True),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("source", JSONB, nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_external_cache_expires_at", "external_cache", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_external_cache_expires_at", table_name="external_cache")
    op.drop_table("external_cache")
