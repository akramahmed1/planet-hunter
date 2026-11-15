"""Scan engine tables (Phase 6): targets, scan_jobs, scan_runs, signals, reviews.

The job queue follows ADR 0003: claim with FOR UPDATE SKIP LOCKED, a lease in
locked_by / locked_until, and finish only while holding the lease.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

NOW = sa.text("now()")


def upgrade() -> None:
    op.create_table(
        "targets",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("tic_id", sa.BigInteger, nullable=False, unique=True),
        sa.Column("toi", sa.String(32)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
    )
    op.create_table(
        "scan_jobs",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("target_id", sa.BigInteger, sa.ForeignKey("targets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("params", JSONB, nullable=False),
        sa.Column("cache_key", sa.String(128), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("locked_by", sa.String(64)),
        sa.Column("locked_until", sa.DateTime(timezone=True)),
        sa.Column("progress", sa.String(200)),
        sa.Column("error", sa.Text),
        sa.Column("requester", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status in ('queued', 'running', 'succeeded', 'failed')", name="ck_scan_jobs_status"),
    )
    op.create_index("ix_scan_jobs_status_created", "scan_jobs", ["status", "created_at"])
    op.create_index("ix_scan_jobs_cache_key", "scan_jobs", ["cache_key"])
    op.create_index("ix_scan_jobs_requester_created", "scan_jobs", ["requester", "created_at"])
    op.create_table(
        "scan_runs",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("job_id", sa.BigInteger, sa.ForeignKey("scan_jobs.id", ondelete="CASCADE"), nullable=False,
                  unique=True),
        sa.Column("target_id", sa.BigInteger, sa.ForeignKey("targets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pipeline_version", sa.String(32), nullable=False),
        sa.Column("sectors", JSONB, nullable=False),
        sa.Column("n_cadences", sa.Integer, nullable=False),
        sa.Column("lightcurve", JSONB, nullable=False),
        sa.Column("periodogram", JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
    )
    op.create_table(
        "signals",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("run_id", sa.BigInteger, sa.ForeignKey("scan_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_d", sa.Float, nullable=False),
        sa.Column("t0_btjd", sa.Float, nullable=False),
        sa.Column("duration_d", sa.Float, nullable=False),
        sa.Column("depth_ppm", sa.Float, nullable=False),
        sa.Column("snr", sa.Float, nullable=False),
        sa.Column("power", sa.Float, nullable=False),
        sa.Column("vetting", JSONB, nullable=False),
        sa.Column("crossmatch", JSONB, nullable=False),
        sa.Column("proposed_label", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
    )
    op.create_table(
        "reviews",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("signal_id", sa.BigInteger, sa.ForeignKey("signals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(32), nullable=False),
        sa.Column("reviewer", sa.String(120), nullable=False),
        sa.Column("note", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
    )


def downgrade() -> None:
    op.drop_table("reviews")
    op.drop_table("signals")
    op.drop_table("scan_runs")
    op.drop_index("ix_scan_jobs_requester_created", table_name="scan_jobs")
    op.drop_index("ix_scan_jobs_cache_key", table_name="scan_jobs")
    op.drop_index("ix_scan_jobs_status_created", table_name="scan_jobs")
    op.drop_table("scan_jobs")
    op.drop_table("targets")
