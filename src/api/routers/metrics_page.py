"""
Public metrics page — W4 ops transparency.

Endpoints (all unauthenticated — safe for marketing pages):
- GET /metrics                       -> HTML brag sheet (live KPIs)
- GET /api/v1/metrics/public         -> JSON with the same KPIs
- GET /api/v1/metrics/weekly-brief   -> tweet/LinkedIn-sized text brief

Competitor comparison is intentionally NOT exposed publicly — our internal
benchmarks shouldn't be a fact-of-record on an unauthenticated endpoint.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, PlainTextResponse

from api.services import quality_store

router = APIRouter(tags=["metrics"])

# Accuracy numbers are the current benchmark snapshot (W1 baseline).
# Label as "benchmark" not "live" — these aren't continuously measured yet.
_BENCHMARK_ACCURACY = {
    "english_wer": 4.2,
    "hindi_wer": 7.8,
    "tamil_wer": 9.1,
    "hindi_mos": 4.4,
    "tamil_mos": 4.2,
}

_TARGETS = {
    "p95_ms": 900,
    "uptime": 99.95,
    "hindi_wer": 5.0,
    "csat": 4.3,
}

# Per-workload pricing tiers — honest about what ₹0.80 actually means.
_PRICING_TIERS = {
    "faq_cached": {
        "label": "FAQ / Cached",
        "inr_per_min": 0.80,
        "note": "Short, repetitive queries with response cache enabled. Best case.",
    },
    "dynamic_support": {
        "label": "Dynamic Support / Sales",
        "inr_per_min": 2.50,
        "note": "Variable-length conversations with smart LLM routing (8B/70B mix).",
    },
    "complex_qualification": {
        "label": "Complex / Real Estate / Multi-turn",
        "inr_per_min": 3.00,
        "note": "Long calls with policy questions, escalations, or 70B/Claude routing.",
    },
}


def _collect_public_metrics() -> dict[str, Any]:
    lat = quality_store.latency_summary(hours=24 * 7)
    up30 = quality_store.uptime_percent("api", hours=24 * 30)
    up7 = quality_store.uptime_percent("api", hours=24 * 7)
    csat = quality_store.csat_summary(days=30)
    ops = quality_store.operational_summary(days=30)

    # Pick the best p95 signal available (streaming TTFA when we have it).
    ttfa_p95 = (lat.get("stream") or {}).get("ttfa_p95")
    overall_p95 = (lat.get("overall") or {}).get("p95")
    p95 = ttfa_p95 if ttfa_p95 else overall_p95

    return {
        "as_of": datetime.utcnow().isoformat() + "Z",
        "latency": {
            "p95_ms": p95,
            "ttfa_p95_ms": ttfa_p95,
            "overall_p95_ms": overall_p95,
            "target_ms": _TARGETS["p95_ms"],
            "pct_under_target": (lat.get("stream") or {}).get("pct_under_target")
                or (lat.get("overall") or {}).get("pct_under_target"),
            "sample_count": (lat.get("overall") or {}).get("count", 0),
        },
        "uptime": {
            "percent_7d": up7,
            "percent_30d": up30,
            "target_percent": _TARGETS["uptime"],
        },
        "csat": {
            "avg": csat.get("avg"),
            "count": csat.get("count", 0),
            "promoters_pct": csat.get("promoters_pct"),
            "target": _TARGETS["csat"],
        },
        "operational": {
            "total_calls_30d": ops.get("total_calls", 0),
            "completion_rate": ops.get("completion_rate"),
            "fcr_rate": ops.get("fcr_rate"),
            "avg_handle_time_sec": ops.get("avg_handle_time_sec"),
        },
        "accuracy_benchmark": _BENCHMARK_ACCURACY,
        "targets": _TARGETS,
        "pipeline": {
            "streaming_enabled": True,
            "ensemble_stt_enabled": True,
            "india_grounded_llm": True,
            "language_auto_switch": True,
        },
        "pricing_tiers": _PRICING_TIERS,
    }


@router.get("/api/v1/metrics/public")
async def public_metrics() -> dict[str, Any]:
    """JSON version — stable shape suitable for partner embeds."""
    return _collect_public_metrics()


@router.get("/api/v1/metrics/weekly-brief", response_class=PlainTextResponse)
async def weekly_brief() -> PlainTextResponse:
    """Tweet/LinkedIn-sized summary of the last week."""
    m = _collect_public_metrics()

    def _fmt(v, unit=""):
        if v is None:
            return "—"
        return f"{v}{unit}"

    headline = (
        f"VoiceFlow AI — weekly update\n\n"
        f"• p95 latency: {_fmt(m['latency']['p95_ms'], 'ms')} "
        f"(target {m['latency']['target_ms']}ms)\n"
        f"• Uptime 30d: {_fmt(m['uptime']['percent_30d'], '%')}\n"
        f"• CSAT: {_fmt(m['csat']['avg'], '/5')} "
        f"({_fmt(m['csat']['count'])} ratings)\n"
        f"• Calls handled (30d): {_fmt(m['operational']['total_calls_30d'])}\n"
        f"• Hindi WER benchmark: {_fmt(m['accuracy_benchmark']['hindi_wer'], '%')}\n"
        f"\nLive: https://voice.shadowmarket.ai/metrics"
    )
    return PlainTextResponse(headline, media_type="text/plain; charset=utf-8")


# ── HTML view ───────────────────────────────────────────────────────────

def _pill(value: str, tone: str = "indigo") -> str:
    colors = {
        "indigo": "#6366f1", "emerald": "#10b981",
        "amber": "#f59e0b", "rose": "#ef4444", "slate": "#64748b",
    }
    c = colors.get(tone, colors["indigo"])
    return f'<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:{c}1a;color:{c};font-weight:600;font-size:11px">{value}</span>'


def _metric_card(label: str, value: str, sub: str, tone: str = "indigo") -> str:
    return (
        f'<div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:18px">'
        f'<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">{label}</div>'
        f'<div style="font-size:26px;font-weight:700;color:#0f172a">{value}</div>'
        f'<div style="font-size:12px;color:#64748b;margin-top:4px">{sub}</div>'
        f'</div>'
    )


@router.get("/metrics", response_class=HTMLResponse)
async def metrics_html() -> HTMLResponse:
    """Public ops transparency page."""
    m = _collect_public_metrics()
    lat = m["latency"]
    up = m["uptime"]
    csat = m["csat"]
    ops = m["operational"]
    acc = m["accuracy_benchmark"]

    def _v(x, unit=""):
        return f"{x}{unit}" if x is not None else "—"

    # Latency — compare against 900ms target
    p95 = lat["p95_ms"]
    p95_tone = "emerald" if p95 and p95 <= lat["target_ms"] else ("amber" if p95 else "slate")
    p95_badge = _pill(
        "on target" if p95 and p95 <= lat["target_ms"]
        else "above target" if p95 else "no data yet",
        p95_tone,
    )

    uptime_tone = "emerald" if up["percent_30d"] >= up["target_percent"] else "amber"
    csat_tone = "emerald" if (csat["avg"] or 0) >= csat["target"] else "amber"

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VoiceFlow AI — Live Metrics</title>
<meta name="description" content="Live operational metrics for VoiceFlow AI: latency, uptime, CSAT, accuracy, call volume.">
<style>
  body {{ font-family: -apple-system, 'Segoe UI', Inter, Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }}
  .wrap {{ max-width: 880px; margin: 0 auto; padding: 48px 20px 80px; }}
  h1 {{ font-size: 28px; margin: 0 0 8px 0; }}
  .sub {{ color:#64748b; font-size: 14px; margin: 0 0 24px 0; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }}
  .card {{ background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-top: 24px; }}
  .card h2 {{ margin: 0 0 12px 0; font-size: 15px; font-weight: 600; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
  table td {{ padding: 10px 0; border-bottom: 1px solid #f1f5f9; }}
  table td:last-child {{ text-align: right; font-weight: 600; font-family: ui-monospace, monospace; }}
  .foot {{ margin-top: 36px; text-align: center; color: #94a3b8; font-size: 12px; }}
  .foot a {{ color: #64748b; }}
</style>
</head>
<body>
  <div class="wrap">
    <h1>VoiceFlow AI — Live Metrics</h1>
    <p class="sub">Ops transparency. We publish these numbers so you can check our claims.<br>
      Last updated {m["as_of"]}.</p>

    <div class="grid">
      {_metric_card("p95 Latency", _v(p95, "ms"),
                    f"target {lat['target_ms']}ms · {p95_badge}", p95_tone)}
      {_metric_card("Uptime (30d)", _v(up["percent_30d"], "%"),
                    f"target {up['target_percent']}% · 7d {up['percent_7d']}%", uptime_tone)}
      {_metric_card("CSAT", _v(csat["avg"], "/5"),
                    f"{_v(csat['count'])} ratings · {_v(csat['promoters_pct'], '%')} promoters", csat_tone)}
      {_metric_card("Calls handled (30d)", _v(ops['total_calls_30d']),
                    f"Completion {_v(ops['completion_rate'], '%')} · FCR {_v(ops['fcr_rate'], '%')}", "indigo")}
    </div>

    <div class="card">
      <h2>Accuracy benchmark</h2>
      <table>
        <tr><td>English WER</td><td>{acc['english_wer']}%</td></tr>
        <tr><td>Hindi WER</td><td>{acc['hindi_wer']}% (target {_TARGETS['hindi_wer']}%)</td></tr>
        <tr><td>Tamil WER</td><td>{acc['tamil_wer']}%</td></tr>
        <tr><td>Hindi TTS MOS</td><td>{acc['hindi_mos']}/5</td></tr>
        <tr><td>Tamil TTS MOS</td><td>{acc['tamil_mos']}/5</td></tr>
      </table>
      <p style="font-size:11px;color:#94a3b8;margin:10px 0 0 0">
        Benchmark dataset · re-measured at each release · live WER landing in W5.
      </p>
    </div>

    <div class="card">
      <h2>Pricing per minute (by workload type)</h2>
      <table>
        <tr><td>FAQ / Cached (response cache ON)</td><td style="font-weight:700;color:#10b981">₹0.80</td></tr>
        <tr><td>Dynamic Support / Sales</td><td style="font-weight:700">₹2.50</td></tr>
        <tr><td>Complex / Real Estate / Multi-turn</td><td style="font-weight:700">₹3.00</td></tr>
      </table>
      <p style="font-size:11px;color:#94a3b8;margin:10px 0 0 0">
        ₹0.80 is achievable on FAQ-heavy agents with response caching. Dynamic conversations
        with variable-length replies average ₹2.00–3.00. All tiers include STT + LLM + TTS.
      </p>
    </div>

    <div class="card">
      <h2>Pipeline features in production</h2>
      <table>
        <tr><td>Streaming LLM+TTS pipeline</td><td style="color:#10b981">ON</td></tr>
        <tr><td>Ensemble STT (Deepgram + Sarvam race for Indic)</td><td style="color:#10b981">ON</td></tr>
        <tr><td>India-grounded LLM prompts (INR/IST/DD-MM)</td><td style="color:#10b981">ON</td></tr>
        <tr><td>Per-utterance language auto-switch</td><td style="color:#10b981">ON</td></tr>
        <tr><td>Multi-provider health probes (5 min)</td><td style="color:#10b981">ON</td></tr>
      </table>
    </div>

    <p class="foot">
      <a href="/api/v1/metrics/public">JSON</a> ·
      <a href="/api/v1/metrics/weekly-brief">Weekly brief</a> ·
      <a href="/status">Status</a>
    </p>
  </div>
</body>
</html>"""
    return HTMLResponse(html)
