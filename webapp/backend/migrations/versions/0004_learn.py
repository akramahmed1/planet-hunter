"""Learn and quiz tables (Phase 7): lessons, lesson_steps, quizzes, questions, choices.

Rows are synced from the versioned files in content/lessons/ by learn/sync.py at
startup; the files are the source of truth and are reviewed in PRs. Questions
keep their (quiz, key) identity across syncs so Phase 8 submissions can point at them.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

NOW = sa.text("now()")


def upgrade() -> None:
    op.create_table(
        "lessons",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("minutes", sa.Integer, nullable=False),
        sa.Column("badge", JSONB, nullable=False),
        sa.Column("links", JSONB, nullable=False),
        sa.Column("digest", sa.String(32), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
    )
    op.create_table(
        "lesson_steps",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("lesson_id", sa.BigInteger, sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("heading", sa.Text, nullable=False),
        sa.Column("body", JSONB, nullable=False),
        sa.Column("facts", JSONB, nullable=False),
        sa.UniqueConstraint("lesson_id", "position", name="uq_lesson_steps_position"),
    )
    op.create_table(
        "quizzes",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("lesson_id", sa.BigInteger, sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False,
                  unique=True),
    )
    op.create_table(
        "questions",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("quiz_id", sa.BigInteger, sa.ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("prompt", sa.Text, nullable=False),
        sa.Column("explanation", sa.Text, nullable=False),
        sa.Column("source", JSONB, nullable=False),
        sa.Column("answer", sa.Float),
        sa.Column("tolerance", sa.Float),
        sa.Column("unit", sa.String(32)),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("quiz_id", "key", name="uq_questions_key"),
        sa.CheckConstraint("kind in ('choice', 'numeric')", name="ck_questions_kind"),
        sa.CheckConstraint("kind <> 'numeric' or (answer is not null and tolerance > 0)", name="ck_questions_numeric"),
    )
    op.create_table(
        "choices",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("question_id", sa.BigInteger, sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("correct", sa.Boolean, nullable=False),
        sa.Column("explanation", sa.Text, nullable=False),
        sa.UniqueConstraint("question_id", "position", name="uq_choices_position"),
    )


def downgrade() -> None:
    for t in ("choices", "questions", "quizzes", "lesson_steps", "lessons"):
        op.drop_table(t)
