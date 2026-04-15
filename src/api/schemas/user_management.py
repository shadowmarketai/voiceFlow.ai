"""
VoiceFlow Marketing AI - User Management Schemas
==================================================
Pydantic models for admin user management endpoints.
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserListItem(BaseModel):
    """User summary for list views."""
    id: str
    email: str
    full_name: str
    role: str = "user"
    is_active: bool = True
    company: Optional[str] = None
    plan: str = "starter"
    created_at: Optional[str] = None
    last_login_at: Optional[str] = None
    oauth_provider: Optional[str] = None
    avatar_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class UserListResponse(BaseModel):
    """Paginated user list response."""
    users: list[UserListItem]
    total: int
    page: int = 1
    per_page: int = 20


class UserRoleUpdate(BaseModel):
    """Request to change a user's role."""
    role: str = Field(..., pattern="^(admin|manager|agent|user|viewer)$")


class UserStatusUpdate(BaseModel):
    """Request to activate/deactivate a user."""
    is_active: bool


class UserInviteRequest(BaseModel):
    """Request to invite a new user."""
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=200)
    role: str = Field(default="user", pattern="^(admin|manager|agent|user|viewer)$")
    company: Optional[str] = Field(default=None, max_length=200)

    model_config = ConfigDict(from_attributes=True)


class UserUpdateRequest(BaseModel):
    """Request to update a user's details."""
    full_name: Optional[str] = Field(default=None, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    company: Optional[str] = Field(default=None, max_length=200)
    role: Optional[str] = Field(default=None, pattern="^(admin|manager|agent|user|viewer)$")
    plan: Optional[str] = Field(default=None, max_length=50)
    is_active: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class UserDetailResponse(BaseModel):
    """Detailed user response for admin views."""
    id: str
    email: str
    full_name: str
    role: str = "user"
    is_active: bool = True
    is_verified: bool = False
    company: Optional[str] = None
    phone: Optional[str] = None
    plan: str = "starter"
    created_at: Optional[str] = None
    last_login_at: Optional[str] = None
    oauth_provider: Optional[str] = None
    avatar_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
