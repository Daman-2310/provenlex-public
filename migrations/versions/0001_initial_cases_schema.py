"""Initial cases schema + schema_migrations table.

Revision ID: 0001
Revises:
Create Date: 2026-05-08
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version     INTEGER PRIMARY KEY,
            applied_at  REAL NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS cases (
            id          TEXT    PRIMARY KEY,
            bot_type    TEXT    NOT NULL,
            score       REAL    NOT NULL,
            summary     TEXT,
            status      TEXT    DEFAULT 'OPEN',
            notes       TEXT    DEFAULT '',
            created_at  REAL    NOT NULL,
            updated_at  REAL    NOT NULL
        )
    """)


def downgrade() -> None:
    op.drop_table("cases")
    op.drop_table("schema_migrations")
