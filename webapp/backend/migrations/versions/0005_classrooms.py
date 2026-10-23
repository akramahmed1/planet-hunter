"""Accounts and multi-tenant classrooms (Phase 8).

Tables: organizations, users, memberships, classes, class_members, assignments,
submissions, audit_log, plus sessions and auth_failures for sign-in.

Every classroom row carries org_id, and child rows point at their parents by
(org_id, id) composite foreign keys, so the database itself rejects a row that
points into another org (ADR 0004). Students are class_members: a nickname and
a PIN hash, no email. Only the outcome of the 13+ age check is stored (ADR 0005).

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

NOW = sa.text("now()")


def _id():
    return sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True)


def _created():
    return sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW)


def _org():
    return sa.Column("org_id", sa.BigInteger, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)


def upgrade() -> None:
    op.create_table(
        "organizations",
        _id(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("join_code", sa.String(16), nullable=False, unique=True),
        _created(),
    )
    op.create_table(
        "users",
        _id(),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("display_name", sa.String(80), nullable=False),
        sa.Column("age_confirmed_at", sa.DateTime(timezone=True), nullable=False),
        _created(),
    )
    op.create_index("uq_users_email", "users", [sa.text("lower(email)")], unique=True)
    op.create_table(
        "memberships",
        _org(),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        _created(),
        sa.PrimaryKeyConstraint("org_id", "user_id"),
        sa.CheckConstraint("role in ('org_admin', 'teacher')", name="ck_memberships_role"),
    )
    op.create_table(
        "classes",
        _id(),
        _org(),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("join_code", sa.String(16), nullable=False, unique=True),
        sa.Column("created_by", sa.BigInteger, sa.ForeignKey("users.id", ondelete="SET NULL")),
        _created(),
        sa.UniqueConstraint("org_id", "id", name="uq_classes_org_id"),
    )
    op.create_table(
        "class_members",
        _id(),
        _org(),
        sa.Column("class_id", sa.BigInteger, nullable=False),
        sa.Column("nickname", sa.String(24), nullable=False),
        sa.Column("pin_hash", sa.Text, nullable=False),
        sa.Column("age_confirmed_at", sa.DateTime(timezone=True), nullable=False),
        _created(),
        sa.ForeignKeyConstraint(["org_id", "class_id"], ["classes.org_id", "classes.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("org_id", "id", name="uq_class_members_org_id"),
    )
    op.create_index("uq_class_members_nickname", "class_members", ["class_id", sa.text("lower(nickname)")], unique=True)
    op.create_table(
        "assignments",
        _id(),
        _org(),
        sa.Column("class_id", sa.BigInteger, nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("ref", sa.String(64), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", sa.BigInteger, sa.ForeignKey("users.id", ondelete="SET NULL")),
        _created(),
        sa.CheckConstraint("kind in ('lesson', 'quiz', 'hunt')", name="ck_assignments_kind"),
        sa.ForeignKeyConstraint(["org_id", "class_id"], ["classes.org_id", "classes.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("org_id", "id", name="uq_assignments_org_id"),
    )
    op.create_index("ix_assignments_class", "assignments", ["class_id"])
    op.create_table(
        "submissions",
        _id(),
        _org(),
        sa.Column("assignment_id", sa.BigInteger, nullable=False),
        sa.Column("member_id", sa.BigInteger, nullable=False),
        sa.Column("score", sa.Float, nullable=False),
        sa.Column("max_score", sa.Float, nullable=False),
        sa.Column("detail", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.UniqueConstraint("assignment_id", "member_id", name="uq_submissions_member"),
        sa.ForeignKeyConstraint(["org_id", "assignment_id"], ["assignments.org_id", "assignments.id"],
                                ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id", "member_id"], ["class_members.org_id", "class_members.id"],
                                ondelete="CASCADE"),
    )
    # Audit rows outlive what they describe: no cascade, and org_id is kept as a plain number.
    op.create_table(
        "audit_log",
        _id(),
        sa.Column("org_id", sa.BigInteger, nullable=False),
        sa.Column("actor_user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(48), nullable=False),
        sa.Column("target", sa.String(120), nullable=False),
        sa.Column("detail", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
    )
    op.create_index("ix_audit_log_org_at", "audit_log", ["org_id", "at"])
    op.create_table(
        "sessions",
        _id(),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("member_id", sa.BigInteger, sa.ForeignKey("class_members.id", ondelete="CASCADE")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        _created(),
        sa.CheckConstraint("(user_id is null) <> (member_id is null)", name="ck_sessions_one_principal"),
    )
    op.create_table(
        "auth_failures",
        _id(),
        sa.Column("key", sa.String(128), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
    )
    op.create_index("ix_auth_failures_key_at", "auth_failures", ["key", "at"])


def downgrade() -> None:
    for t in ("auth_failures", "sessions", "audit_log", "submissions", "assignments", "class_members", "classes",
              "memberships", "users", "organizations"):
        op.drop_table(t)
