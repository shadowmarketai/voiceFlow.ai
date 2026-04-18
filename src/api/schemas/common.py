"""
VoiceFlow Marketing AI - Common Schemas
========================================
Shared response models used across multiple endpoints.
Uses Pydantic v2 with model_config = ConfigDict (KB-014).
"""

from typing import Any, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str
    success: bool = True

    model_config = ConfigDict(from_attributes=True)


class ErrorResponse(BaseModel):
    """Standard error response body."""

    error: bool = True
    detail: str
    status_code: int
    errors: list[dict[str, Any]] | None = None

    model_config = ConfigDict(from_attributes=True)


class PaginatedResponse(BaseModel):
    """Generic paginated response wrapper.

    Usage in endpoints::

        return PaginatedResponse(
            items=lead_list,
            total=100,
            page=1,
            page_size=20,
        )
    """

    items: list[Any] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
    total_pages: int = 0

    model_config = ConfigDict(from_attributes=True)

    def model_post_init(self, __context: Any) -> None:
        """Calculate total_pages after initialization."""
        if self.page_size > 0 and self.total > 0:
            self.total_pages = (self.total + self.page_size - 1) // self.page_size
