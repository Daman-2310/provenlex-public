"""Add alert_feedback table for operator true/false positive signals.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-08
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS alert_feedback (
            id          TEXT    PRIMARY KEY,
            round_id    TEXT    NOT NULL,
            was_anomaly INTEGER NOT NULL,
            operator    TEXT    NOT NULL,
            notes       TEXT    DEFAULT '',
            created_at  REAL    NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_af_round ON alert_feedback(round_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_af_round")
    op.drop_table("alert_feedback")
