"""
VoiceFlow Marketing AI - User Management Schemas
==================================================
Pydantic models for admin user management endpoints.
"""


from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserListItem(BaseModel):
    """User summary for list views."""
    id: str
    email: str
    full_name: str
    role: str = "user"
    is_active: bool = True
    company: str | None = None
    plan: str = "starter"
    created_at: str | None = None
    last_login_at: str | None = None
    oauth_provider: str | None = None
    avatar_url: str | None = None

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
    company: str | None = Field(default=None, max_length=200)

    model_config = ConfigDict(from_attributes=True)


class UserUpdateRequest(BaseModel):
    """Request to update a user's details."""
    full_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=20)
    company: str | None = Field(default=None, max_length=200)
    role: str | None = Field(default=None, pattern="^(admin|manager|agent|user|viewer)$")
    plan: str | None = Field(default=None, max_length=50)
    is_active: bool | None = None

    model_config = ConfigDict(from_attributes=True)


class UserDetailResponse(BaseModel):
    """Detailed user response for admin views."""
    id: str
    email: str
    full_name: str
    role: str = "user"
    is_active: bool = True
    is_verified: bool = False
    company: str | None = None
    phone: str | None = None
    plan: str = "starter"
    created_at: str | None = None
    last_login_at: str | None = None
    oauth_provider: str | None = None
    avatar_url: str | None = None

    model_config = ConfigDict(from_attributes=True)
