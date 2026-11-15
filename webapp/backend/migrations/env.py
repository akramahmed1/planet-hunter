"""Alembic environment. Uses DATABASE_URL via db.database_url() and the v2 metadata."""
from __future__ import annotations

from alembic import context
from sqlalchemy import create_engine, pool

import db

url = context.config.attributes.get("database_url") or db.database_url()
if not url:
    raise RuntimeError("DATABASE_URL is not set; refusing to run migrations")

target_metadata = db.Base.metadata


def run_offline() -> None:
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_online() -> None:
    connectable = create_engine(url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_offline()
else:
    run_online()
