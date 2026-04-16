"""
Public status page — no auth, safe to link from marketing.

Endpoints:
- GET /status                     -> HTML (status.shadowmarket.ai landing)
- GET /api/v1/status/public       -> JSON summary for status page or external monitors
- GET /api/v1/status/incidents    -> last 24h of failed provider/self probes
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from sqlalchemy import desc, select

from api.database import get_session_factory
from api.models.quality_metrics import ProviderProbe, UptimeProbe
from api.services import quality_store

router = APIRouter(tags=["status"])


def _overall_status(uptime_7d: float, provider_down: int) -> str:
    if uptime_7d < 95.0 or provider_down >= 3:
        return "major_outage"
    if uptime_7d < 99.0 or provider_down >= 1:
        return "degraded"
    return "operational"


def _collect_public_status() -> dict[str, Any]:
    up7 = quality_store.uptime_percent("api", hours=24 * 7)
    up30 = quality_store.uptime_percent("api", hours=24 * 30)
    providers = quality_store.provider_uptime_summary(hours=24)

    # Count providers currently considered down (ok_pct < 95 over 24h)
    down = 0
    for cat_rows in providers.values():
        for row in cat_rows:
            pct = row.get("ok_pct")
            if pct is not None and pct < 95.0:
                down += 1

    status = _overall_status(up7, down)

    services = [
        {"name": "API Server", "status": "up" if up7 >= 99.0 else "degraded"},
        {"name": "LiveKit WebRTC", "status": "up"},
        {"name": "Voice Pipeline (STT → LLM → TTS)", "status": "up" if down == 0 else "degraded"},
        {"name": "Dashboard", "status": "up"},
    ]

    return {
        "status": status,
        "uptime_7d": up7,
        "uptime_30d": up30,
        "services": services,
        "providers": providers,
        "providers_degraded": down,
        "as_of": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/api/v1/status/public")
async def public_status() -> dict[str, Any]:
    """JSON version of the public status page — scrapable by uptimerobot etc."""
    return _collect_public_status()


@router.post("/api/v1/status/test-pipeline")
async def test_pipeline() -> dict[str, Any]:
    """Run one synthetic LLM turn on demand. Useful for CI + manual smoke tests."""
    from api.services.synthetic_probe import run_synthetic_turn
    result = await run_synthetic_turn()
    return result


@router.get("/api/v1/status/incidents")
async def recent_incidents(hours: int = 24) -> dict[str, Any]:
    """Failed probes in the last `hours` window (provider + self)."""
    since = datetime.utcnow() - timedelta(hours=hours)
    items: list[dict[str, Any]] = []
    try:
        with get_session_factory()() as s:
            for row in s.execute(
                select(ProviderProbe)
                .where(ProviderProbe.ts >= since, ProviderProbe.ok.is_(False))
                .order_by(desc(ProviderProbe.ts))
                .limit(50)
            ).scalars():
                items.append({
                    "ts": row.ts.isoformat() + "Z",
                    "kind": "provider",
                    "category": row.category,
                    "target": row.provider,
                    "http_status": row.http_status,
                    "note": row.note,
                })
            for row in s.execute(
                select(UptimeProbe)
                .where(UptimeProbe.ts >= since, UptimeProbe.ok.is_(False))
                .order_by(desc(UptimeProbe.ts))
                .limit(50)
            ).scalars():
                items.append({
                    "ts": row.ts.isoformat() + "Z",
                    "kind": "self",
                    "target": row.service,
                    "latency_ms": row.latency_ms,
                })
    except Exception:
        pass

    items.sort(key=lambda r: r["ts"], reverse=True)
    return {"window_hours": hours, "count": len(items), "incidents": items[:50]}


# ── HTML view ───────────────────────────────────────────────────────────

_STATUS_COLORS = {
    "operational": ("#10b981", "All systems operational"),
    "degraded": ("#f59e0b", "Partial degradation"),
    "major_outage": ("#ef4444", "Major outage"),
}


def _svc_dot(state: str) -> str:
    color = "#10b981" if state == "up" else ("#f59e0b" if state == "degraded" else "#ef4444")
    return f'<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:{color};margin-right:8px"></span>'


def _provider_row(cat: str, rows: list[dict[str, Any]]) -> str:
    if not rows:
        return f'<tr><td colspan="4" style="padding:12px;color:#94a3b8;font-style:italic">No {cat.upper()} probes yet — will populate in a few minutes.</td></tr>'
    out = []
    for r in rows:
        pct = r.get("ok_pct")
        lat = r.get("avg_latency_ms")
        pct_str = f"{pct}%" if pct is not None else "—"
        lat_str = f"{int(lat)} ms" if lat is not None else "—"
        ok = (pct or 0) >= 95.0
        dot = _svc_dot("up" if ok else "degraded")
        out.append(
            f'<tr>'
            f'<td style="padding:10px 12px">{dot}{r["provider"]}</td>'
            f'<td style="padding:10px 12px;color:#64748b">{cat.upper()}</td>'
            f'<td style="padding:10px 12px">{pct_str}</td>'
            f'<td style="padding:10px 12px;color:#64748b">{lat_str}</td>'
            f'</tr>'
        )
    return "".join(out)


@router.get("/status", response_class=HTMLResponse)
async def status_html() -> HTMLResponse:
    """Public status page — marketing-safe landing at status.shadowmarket.ai."""
    data = _collect_public_status()
    color, label = _STATUS_COLORS.get(data["status"], _STATUS_COLORS["operational"])

    services_html = "".join(
        f'<li style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between">'
        f'<span>{_svc_dot(s["status"])}{s["name"]}</span>'
        f'<span style="color:#64748b;font-size:13px;text-transform:capitalize">{s["status"]}</span>'
        f'</li>'
        for s in data["services"]
    )

    provider_rows = "".join(
        _provider_row(cat, rows) for cat, rows in data["providers"].items()
    )

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VoiceFlow AI — Status</title>
<meta name="description" content="Live status for VoiceFlow AI: uptime, provider health, recent incidents.">
<style>
  body {{ font-family: -apple-system, 'Segoe UI', Inter, Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }}
  .wrap {{ max-width: 780px; margin: 0 auto; padding: 48px 20px 80px; }}
  .hero {{ background: {color}; color: white; border-radius: 20px; padding: 28px 24px; box-shadow: 0 10px 30px -12px {color}55; }}
  .hero h1 {{ margin: 0 0 4px 0; font-size: 24px; font-weight: 700; }}
  .hero p  {{ margin: 0; opacity: 0.95; font-size: 14px; }}
  .card {{ background: white; border-radius: 16px; margin-top: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; }}
  .card h2 {{ margin: 0; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; font-size: 15px; font-weight: 600; }}
  .kpis {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 20px; }}
  .kpi {{ background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; }}
  .kpi .v {{ font-size: 22px; font-weight: 700; color: #0f172a; }}
  .kpi .l {{ font-size: 11px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
  table td {{ border-bottom: 1px solid #f1f5f9; }}
  ul {{ list-style: none; margin: 0; padding: 0; }}
  .foot {{ margin-top: 32px; text-align: center; color: #94a3b8; font-size: 12px; }}
  .foot a {{ color: #64748b; }}
</style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1>{label}</h1>
      <p>Last updated {data["as_of"]} · 7-day uptime <b>{data["uptime_7d"]}%</b></p>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="v">{data["uptime_7d"]}%</div><div class="l">Uptime 7d</div></div>
      <div class="kpi"><div class="v">{data["uptime_30d"]}%</div><div class="l">Uptime 30d</div></div>
      <div class="kpi"><div class="v">{data["providers_degraded"]}</div><div class="l">Providers degraded</div></div>
    </div>

    <div class="card">
      <h2>Services</h2>
      <ul>{services_html}</ul>
    </div>

    <div class="card">
      <h2>Provider health (24h)</h2>
      <table>
        <thead>
          <tr style="background:#f8fafc;color:#64748b;font-size:12px;text-transform:uppercase">
            <th style="text-align:left;padding:10px 12px">Provider</th>
            <th style="text-align:left;padding:10px 12px">Kind</th>
            <th style="text-align:left;padding:10px 12px">Success rate</th>
            <th style="text-align:left;padding:10px 12px">Avg latency</th>
          </tr>
        </thead>
        <tbody>{provider_rows}</tbody>
      </table>
    </div>

    <p class="foot">
      Powered by VoiceFlow AI · <a href="/api/v1/status/public">JSON</a> · <a href="/api/v1/status/incidents">Incidents</a>
    </p>
  </div>
</body>
</html>"""
    return HTMLResponse(html)
