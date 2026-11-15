"""Saved scans: a signed-in teacher or student keeps a short list of scans to come back to (launch task T40).

One row per (person, scan). A person is a teacher (user_id) or a student (member_id), never both. The row holds only a
pointer to a public scan and an optional short label the person types (up to 80 characters, shown as plain text).
It goes with its owner (ON DELETE CASCADE from users and class_members) and with the scan (cascade from scan_jobs).
At most 50 per person (enforced in code, tested).

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saved_scans",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("member_id", sa.BigInteger, sa.ForeignKey("class_members.id", ondelete="CASCADE")),
        sa.Column("job_id", sa.BigInteger, sa.ForeignKey("scan_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(80)),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("(user_id is null) <> (member_id is null)", name="ck_saved_scans_one_owner"),
    )
    op.create_index("uq_saved_scans_user", "saved_scans", ["user_id", "job_id"], unique=True,
                    postgresql_where=sa.text("user_id is not null"))
    op.create_index("uq_saved_scans_member", "saved_scans", ["member_id", "job_id"], unique=True,
                    postgresql_where=sa.text("member_id is not null"))
    op.create_index("ix_saved_scans_job", "saved_scans", ["job_id"])


def downgrade() -> None:
    op.drop_table("saved_scans")
