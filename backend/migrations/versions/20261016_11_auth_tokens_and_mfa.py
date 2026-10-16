"""Refresh tokens, one-time user tokens, MFA recovery codes and user security columns.

Revision ID: 11k2l3m4n5o6
Revises: 10j1k2l3m4n5
Create Date: 2026-10-16

Existing users are grandfathered as email-verified (``email_verified_at = now()``): they
registered before verification existed and blocking them would lock tenants out. New
registrations verify through an emailed single-use token.
"""

import sqlalchemy as sa
from alembic import op

revision = "11k2l3m4n5o6"
down_revision = "10j1k2l3m4n5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True)))
    op.add_column(
        "users",
        sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("totp_secret_encrypted", sa.String(1024)))
    op.add_column("users", sa.Column("mfa_enabled_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("totp_last_step", sa.BigInteger()))
    op.execute("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP")
    op.alter_column("users", "failed_login_attempts", server_default=None)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "organization_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("mfa_verified", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_reason", sa.String(50)),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("user_agent", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_organization_id", "refresh_tokens", ["organization_id"])
    op.create_index("ix_refresh_tokens_family", "refresh_tokens", ["family_id"])

    purpose = sa.Enum("EMAIL_VERIFICATION", "PASSWORD_RESET", name="usertokenpurpose")
    op.create_table(
        "user_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "organization_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("purpose", purpose, nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_user_tokens_user_id", "user_tokens", ["user_id"])
    op.create_index("ix_user_tokens_organization_id", "user_tokens", ["organization_id"])

    op.create_table(
        "mfa_recovery_codes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "organization_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_mfa_recovery_codes_user_id", "mfa_recovery_codes", ["user_id"])
    op.create_index(
        "ix_mfa_recovery_codes_organization_id", "mfa_recovery_codes", ["organization_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_mfa_recovery_codes_organization_id", table_name="mfa_recovery_codes")
    op.drop_index("ix_mfa_recovery_codes_user_id", table_name="mfa_recovery_codes")
    op.drop_table("mfa_recovery_codes")
    op.drop_index("ix_user_tokens_organization_id", table_name="user_tokens")
    op.drop_index("ix_user_tokens_user_id", table_name="user_tokens")
    op.drop_table("user_tokens")
    sa.Enum(name="usertokenpurpose").drop(op.get_bind(), checkfirst=True)
    op.drop_index("ix_refresh_tokens_family", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_organization_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    for column in (
        "totp_last_step",
        "mfa_enabled_at",
        "totp_secret_encrypted",
        "last_login_at",
        "locked_until",
        "failed_login_attempts",
        "email_verified_at",
    ):
        op.drop_column("users", column)
