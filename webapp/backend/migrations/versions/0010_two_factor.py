"""Optional two-step sign-in for teachers (launch task T20).

users.totp_secret_enc: the authenticator secret, AES-GCM encrypted (null until set up).
users.totp_enabled_at: null while set up is pending, so a half finished setup never blocks sign-in.
users.totp_last_step: the last accepted 30 second step, so one code works once.
recovery_codes: SHA-256 hashes of one-use backup codes.
login_challenges: the short lived ticket handed out after a correct password when two-step is on; the session only
starts when the ticket is redeemed with a code. Only a hash of the ticket is stored; five wrong codes burn it.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-21
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_secret_enc", sa.LargeBinary))
    op.add_column("users", sa.Column("totp_enabled_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("totp_last_step", sa.BigInteger))
    op.create_table(
        "recovery_codes",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("user_id", "code_hash", name="uq_recovery_codes_user_hash"),
    )
    op.create_table(
        "login_challenges",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("login_challenges")
    op.drop_table("recovery_codes")
    for c in ("totp_last_step", "totp_enabled_at", "totp_secret_enc"):
        op.drop_column("users", c)
