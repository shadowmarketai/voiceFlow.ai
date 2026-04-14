"""
E2E tests — API health and basic endpoint checks.
Run against a running server: pytest tests/e2e/ -v
"""

import pytest
import httpx

BASE_URL = "http://localhost:8001"


@pytest.mark.integration
class TestAPIHealth:
    """Test API is running and responding."""

    def test_health_endpoint(self):
        resp = httpx.get(f"{BASE_URL}/health", timeout=5)
        assert resp.status_code == 200

    def test_api_info(self):
        resp = httpx.get(f"{BASE_URL}/api/info", timeout=5)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "running"
        assert "features" in data

    def test_docs_available(self):
        resp = httpx.get(f"{BASE_URL}/docs", timeout=5)
        assert resp.status_code == 200

    def test_telephony_providers(self):
        resp = httpx.get(f"{BASE_URL}/api/v1/telephony/providers", timeout=5)
        assert resp.status_code == 200
        data = resp.json()
        assert "telecmi" in data
        assert "webrtc" in data

    def test_webrtc_ice_config(self):
        resp = httpx.get(f"{BASE_URL}/api/v1/webrtc/ice-config", timeout=5)
        assert resp.status_code == 200
        data = resp.json()
        assert "ice_config" in data

    def test_voice_clone_list(self):
        resp = httpx.get(f"{BASE_URL}/api/v1/voice-clone/voices", timeout=5)
        assert resp.status_code == 200
