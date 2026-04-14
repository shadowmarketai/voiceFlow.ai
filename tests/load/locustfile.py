"""
Load test for VoiceFlow AI.

Scenarios covered (mirroring real production traffic shape):
    1. Dashboard + health hits               (light, high volume)
    2. Quality probe fan-out                 (moderate, 1 per 30s)
    3. LiveKit room + token issuance         (moderate burst)
    4. Voice pipeline (STT→LLM→TTS)          (heavy, long-tail latency)
    5. Call metric ingest                    (fire-and-forget from agents)

Usage:
    # Smoke (10 users, 1m)
    locust -f tests/load/locustfile.py --host=https://voice.shadowmarket.ai \\
           --users 10 --spawn-rate 2 -t 1m --headless

    # Sustained (500 users, 30m)
    locust -f tests/load/locustfile.py --host=https://voice.shadowmarket.ai \\
           --users 500 --spawn-rate 10 -t 30m --headless --csv=reports/load

    # Stress peak (1000 users, 5m)
    locust -f tests/load/locustfile.py --host=https://voice.shadowmarket.ai \\
           --users 1000 --spawn-rate 50 -t 5m --headless

Targets (p95 SLOs):
    /api/health                < 150 ms
    /api/v1/quality/*          < 400 ms
    /api/v1/livekit/token      < 600 ms
    /api/v1/voice/respond      < 2500 ms
"""

from __future__ import annotations

import io
import random
import wave

from locust import HttpUser, between, events, task


def _silent_wav_bytes(seconds: float = 1.0, rate: int = 16000) -> bytes:
    """Return a tiny silent WAV payload to feed the voice pipeline without audio assets."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * int(rate * seconds))
    return buf.getvalue()


_SAMPLE_WAV = _silent_wav_bytes()


class DashboardUser(HttpUser):
    """Mimics a tenant logged into the UI polling dashboard widgets."""

    wait_time = between(2, 5)
    weight = 4

    @task(5)
    def health(self):
        self.client.get("/api/health", name="GET /api/health")

    @task(3)
    def quality_summary(self):
        self.client.get("/api/v1/quality/summary", name="GET /quality/summary")

    @task(2)
    def quality_trends(self):
        self.client.get("/api/v1/quality/trends", name="GET /quality/trends")

    @task(1)
    def quality_competitors(self):
        self.client.get("/api/v1/quality/competitors", name="GET /quality/competitors")


class ProbeUser(HttpUser):
    """Heavy live-probe endpoint — hits external provider APIs."""

    wait_time = between(25, 35)
    weight = 1

    @task
    def probe(self):
        self.client.get("/api/v1/quality/providers", name="GET /quality/providers")


class LiveKitUser(HttpUser):
    """A browser client that starts a WebRTC call."""

    wait_time = between(10, 20)
    weight = 2

    @task(3)
    def livekit_status(self):
        self.client.get("/api/v1/livekit/status", name="GET /livekit/status")

    @task(1)
    def livekit_token(self):
        self.client.post(
            "/api/v1/livekit/token",
            json={
                "agent_id": f"agent-{random.randint(1, 50)}",
                "agent_name": "LoadTest Agent",
                "user_name": f"user-{random.randint(1000, 9999)}",
            },
            name="POST /livekit/token",
        )


class VoicePipelineUser(HttpUser):
    """The expensive path — full STT → LLM → TTS turn."""

    wait_time = between(4, 8)
    weight = 3

    @task
    def voice_turn(self):
        files = {"file": ("sample.wav", _SAMPLE_WAV, "audio/wav")}
        data = {
            "language": random.choice(["en", "hi", "ta"]),
            "llm_provider": "groq",
            "tts_language": "en",
        }
        with self.client.post(
            "/api/v1/voice/respond",
            files=files, data=data,
            name="POST /voice/respond",
            catch_response=True,
        ) as resp:
            if resp.status_code >= 500:
                resp.failure(f"Server error {resp.status_code}")
            elif resp.elapsed.total_seconds() > 2.5:
                resp.failure(f"Too slow: {resp.elapsed.total_seconds():.2f}s")


class CallIngestUser(HttpUser):
    """Simulates agents posting call metrics at end-of-call."""

    wait_time = between(6, 12)
    weight = 2

    @task
    def ingest(self):
        self.client.post(
            "/api/v1/quality/ingest/call",
            json={
                "agent_id": f"agent-{random.randint(1, 50)}",
                "language": random.choice(["en", "hi", "ta", "te"]),
                "duration_sec": random.uniform(30, 600),
                "noise_ms": random.randint(5, 20),
                "vad_ms": random.randint(3, 15),
                "stt_ms": random.randint(150, 400),
                "emotion_ms": random.randint(20, 60),
                "llm_ms": random.randint(180, 500),
                "tts_ms": random.randint(220, 600),
                "eos_ms": random.randint(8, 25),
                "total_ms": random.randint(700, 1600),
                "wer": round(random.uniform(5, 12), 2),
                "tts_mos": round(random.uniform(4.0, 4.8), 2),
                "intent_ok": random.random() > 0.05,
            },
            name="POST /quality/ingest/call",
        )


# ── SLO enforcement — fail the test run if p95 busts the target ──────────

@events.test_stop.add_listener
def _check_slos(environment, **_kwargs):
    stats = environment.stats
    slos = {
        "GET /api/health": 150,
        "GET /quality/summary": 400,
        "GET /quality/trends": 400,
        "GET /livekit/status": 300,
        "POST /livekit/token": 600,
        "POST /voice/respond": 2500,
    }
    failed = []
    for name, limit in slos.items():
        entry = stats.entries.get((name, name.split()[0]))
        if entry and entry.num_requests > 0:
            p95 = entry.get_response_time_percentile(0.95)
            if p95 > limit:
                failed.append(f"{name}: p95={p95:.0f}ms > {limit}ms")
    if failed:
        print("\n[SLO VIOLATIONS]")
        for f in failed:
            print("  " + f)
        environment.process_exit_code = 1
