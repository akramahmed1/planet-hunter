"""Explainer usage counts and classroom billing (Phase 9).

usage_events counts explainer calls for the rate limits. org_plans holds each
organization's plan as reported by verified Stripe webhooks; stripe_events records each
webhook event id once, so a replayed event is not applied twice.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

NOW = sa.text("now()")


def upgrade() -> None:
    op.create_table(
        "usage_events",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("key", sa.String(128), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
    )
    op.create_index("ix_usage_events_key_at", "usage_events", ["key", "at"])
    op.create_table(
        "org_plans",
        sa.Column("org_id", sa.BigInteger, sa.ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("plan", sa.String(16), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("stripe_customer", sa.String(64)),
        sa.Column("stripe_subscription", sa.String(64)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.CheckConstraint("plan in ('free', 'classroom')", name="ck_org_plans_plan"),
    )
    op.create_table(
        "stripe_events",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("type", sa.String(80), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
    )


def downgrade() -> None:
    for t in ("stripe_events", "org_plans", "usage_events"):
        op.drop_table(t)
