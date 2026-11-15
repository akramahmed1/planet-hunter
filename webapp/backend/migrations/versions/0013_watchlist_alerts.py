"""Watchlist and candidate-change alerts (launch task T41).

watchlist          a signed-in teacher's or student's list of up to 20 published candidates (by slug) to keep an eye on.
alert_prefs        a teacher's opt-in to an email when the published candidates change, and the one unsubscribe token
                   that goes in every such email (kept as is, not hashed: the emails must carry it, and all it can do is
                   switch these emails off). Students have no email, so no row is ever made for them.
candidate_snapshots  what the published candidates looked like (slug, label, period) the last times the server
                   started, so the next start can say what is new or changed. The first one is a quiet baseline.
alert_sends        one row per (snapshot, teacher) written before an email is attempted: at most one email per person
                   per change, even if the server restarts in the middle.

Everything cascades from users and class_members, so deleting an account deletes its watchlist and alert settings.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "watchlist",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("member_id", sa.BigInteger, sa.ForeignKey("class_members.id", ondelete="CASCADE")),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("(user_id is null) <> (member_id is null)", name="ck_watchlist_one_owner"),
    )
    op.create_index("uq_watchlist_user", "watchlist", ["user_id", "slug"], unique=True,
                    postgresql_where=sa.text("user_id is not null"))
    op.create_index("uq_watchlist_member", "watchlist", ["member_id", "slug"], unique=True,
                    postgresql_where=sa.text("member_id is not null"))
    op.create_table(
        "alert_prefs",
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("email_alerts", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("unsubscribe_token", sa.String(64), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("uq_alert_prefs_unsubscribe", "alert_prefs", ["unsubscribe_token"], unique=True)
    op.create_table(
        "candidate_snapshots",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("data", JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_table(
        "alert_sends",
        sa.Column("snapshot_id", sa.BigInteger, sa.ForeignKey("candidate_snapshots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sent", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("reason", sa.String(32), nullable=False, server_default=""),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("snapshot_id", "user_id"),
    )


def downgrade() -> None:
    op.drop_table("alert_sends")
    op.drop_table("candidate_snapshots")
    op.drop_table("alert_prefs")
    op.drop_table("watchlist")
