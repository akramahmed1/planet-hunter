"""Learn progress that follows a signed-in teacher or student across devices (launch task T39).

One row per person: a teacher (user_id) or a student (member_id), never both. The document is the same small
version 1 shape the browser keeps (lesson slugs, question keys, counts and one badge time); it names nobody.

Retention: the row goes with the account (ON DELETE CASCADE from users and class_members, so deleting a teacher
account, removing a student or deleting a class removes it), and a row nobody has touched for 24 months is purged
(learn/progress.py purge, run at startup). See docs/DATA_DELETION.md.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learn_progress",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("member_id", sa.BigInteger, sa.ForeignKey("class_members.id", ondelete="CASCADE")),
        sa.Column("doc", JSONB, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("(user_id is null) <> (member_id is null)", name="ck_learn_progress_one_owner"),
    )
    op.create_index("uq_learn_progress_user", "learn_progress", ["user_id"], unique=True,
                    postgresql_where=sa.text("user_id is not null"))
    op.create_index("uq_learn_progress_member", "learn_progress", ["member_id"], unique=True,
                    postgresql_where=sa.text("member_id is not null"))
    op.create_index("ix_learn_progress_updated", "learn_progress", ["updated_at"])


def downgrade() -> None:
    op.drop_table("learn_progress")
