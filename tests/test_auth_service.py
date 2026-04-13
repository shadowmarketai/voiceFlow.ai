"""
Tests for AuthService — password hashing, JWT tokens.
"""

import pytest
from datetime import timedelta

from api.services.auth_service import AuthService


class TestPasswordHashing:
    """Test bcrypt password hashing."""

    def test_hash_password_returns_hash(self):
        hashed = AuthService.hash_password("MyPassword123")
        assert hashed != "MyPassword123"
        assert hashed.startswith("$2b$")  # bcrypt prefix

    def test_verify_correct_password(self):
        hashed = AuthService.hash_password("SecurePass1")
        assert AuthService.verify_password("SecurePass1", hashed) is True

    def test_verify_wrong_password(self):
        hashed = AuthService.hash_password("SecurePass1")
        assert AuthService.verify_password("WrongPassword", hashed) is False

    def test_different_passwords_produce_different_hashes(self):
        h1 = AuthService.hash_password("Password1")
        h2 = AuthService.hash_password("Password2")
        assert h1 != h2

    def test_same_password_different_salts(self):
        h1 = AuthService.hash_password("SamePass")
        h2 = AuthService.hash_password("SamePass")
        # bcrypt uses random salt, so hashes differ
        assert h1 != h2
        # But both verify correctly
        assert AuthService.verify_password("SamePass", h1)
        assert AuthService.verify_password("SamePass", h2)


class TestJWTTokens:
    """Test JWT access and refresh tokens."""

    def test_create_access_token(self):
        token = AuthService.create_access_token({"sub": "test@example.com"})
        assert isinstance(token, str)
        assert len(token) > 20

    def test_create_refresh_token(self):
        token = AuthService.create_refresh_token({"sub": "test@example.com"})
        assert isinstance(token, str)

    def test_decode_access_token(self):
        data = {"sub": "test@example.com", "role": "admin", "user_id": "u1"}
        token = AuthService.create_access_token(data)
        decoded = AuthService.decode_token(token)

        assert decoded["sub"] == "test@example.com"
        assert decoded["role"] == "admin"
        assert decoded["type"] == "access"
        assert "exp" in decoded
        assert "iat" in decoded

    def test_decode_refresh_token(self):
        data = {"sub": "user@test.com"}
        token = AuthService.create_refresh_token(data)
        decoded = AuthService.decode_token(token)

        assert decoded["sub"] == "user@test.com"
        assert decoded["type"] == "refresh"

    def test_expired_token_raises(self):
        from api.exceptions import UnauthorizedError

        token = AuthService.create_access_token(
            {"sub": "test@test.com"},
            expires_delta=timedelta(seconds=-1),
        )
        with pytest.raises(UnauthorizedError):
            AuthService.decode_token(token)

    def test_invalid_token_raises(self):
        from api.exceptions import UnauthorizedError

        with pytest.raises(UnauthorizedError):
            AuthService.decode_token("invalid.token.here")

    def test_custom_expiry(self):
        token = AuthService.create_access_token(
            {"sub": "t@t.com"},
            expires_delta=timedelta(hours=2),
        )
        decoded = AuthService.decode_token(token)
        assert decoded["sub"] == "t@t.com"
