"""
Leads Database - Separate DeclarativeBase
==========================================
Uses a separate Base so leads tables are created in the leads DB,
not the main app DB.
"""

from sqlalchemy.orm import DeclarativeBase


class LeadsBase(DeclarativeBase):
    """Base class for all leads database models."""
    pass
