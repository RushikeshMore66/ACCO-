from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    SQLAlchemy declarative base class for all ACCO database models.
    All models must inherit from this Base to participate in Alembic metadata tracking.
    """
    pass
