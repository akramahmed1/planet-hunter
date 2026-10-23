"""Explainer spend ledger (launch task T14).

Every model call reserves its worst-case cost BEFORE it is made, so concurrent calls cannot overshoot the
monthly cap, and is then settled with the real token usage from the provider (or released if the call
produced nothing to pay for). explainer_spend_state remembers, per month, that the 80 percent warning was
logged and when the cap was first hit.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-21
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

NOW = sa.text("now()")


def upgrade() -> None:
    op.create_table(
        "explainer_spend",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("month", sa.String(7), nullable=False),  # UTC calendar month, "2026-10"
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("reserved_usd", sa.Numeric(12, 6), nullable=False),
        sa.Column("actual_usd", sa.Numeric(12, 6)),
        sa.Column("input_tokens", sa.Integer),
        sa.Column("output_tokens", sa.Integer),
        sa.Column("cache_read_tokens", sa.Integer),
        sa.Column("cache_write_tokens", sa.Integer),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.Column("settled_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status in ('reserved', 'settled', 'released')", name="ck_explainer_spend_status"),
        sa.CheckConstraint("reserved_usd >= 0 and (actual_usd is null or actual_usd >= 0)",
                           name="ck_explainer_spend_nonneg"),
    )
    op.create_index("ix_explainer_spend_month_status", "explainer_spend", ["month", "status"])
    op.create_table(
        "explainer_spend_state",
        sa.Column("month", sa.String(7), primary_key=True),
        sa.Column("warned_80_at", sa.DateTime(timezone=True)),
        sa.Column("capped_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("explainer_spend_state")
    op.drop_table("explainer_spend")
