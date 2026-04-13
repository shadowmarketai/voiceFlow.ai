"""
Super Admin Router — Full platform control
=============================================
Tenant management, user management (password reset, role change,
activate/deactivate), feature toggles, plans, platform stats.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext

from api.dependencies import get_current_active_user
from api.database import db, USE_POSTGRES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin", tags=["Super Admin"])

_ph = "%s" if USE_POSTGRES else "?"
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")


def _require_super_admin(current_user: dict = Depends(get_current_active_user)) -> dict:
    if not current_user.get("is_super_admin", False):
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return current_user


# ═══════════════════════════════════════════════════════════════════
# PLATFORM STATS
# ═══════════════════════════════════════════════════════════════════


@router.get("/stats")
async def platform_stats(user: dict = Depends(_require_super_admin)):
    with db() as conn:
        total_tenants = conn.execute("SELECT COUNT(*) FROM platform_tenants").fetchone()[0]
        active_tenants = conn.execute("SELECT COUNT(*) FROM platform_tenants WHERE is_active=1").fetchone()[0]
        total_users = conn.execute("SELECT COUNT(*) FROM users WHERE is_super_admin=0 OR is_super_admin IS NULL").fetchone()[0]
        active_users = conn.execute("SELECT COUNT(*) FROM users WHERE is_active=1 AND (is_super_admin=0 OR is_super_admin IS NULL)").fetchone()[0]
        total_leads = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        total_quotations = 0
        try:
            total_quotations = conn.execute("SELECT COUNT(*) FROM quotations").fetchone()[0]
        except Exception:
            pass
    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "total_users": total_users,
        "active_users": active_users,
        "total_leads": total_leads,
        "total_quotations": total_quotations,
    }


# ═══════════════════════════════════════════════════════════════════
# TENANT MANAGEMENT
# ═══════════════════════════════════════════════════════════════════


@router.get("/tenants")
async def list_tenants(user: dict = Depends(_require_super_admin)):
    with db() as conn:
        rows = conn.execute("SELECT * FROM platform_tenants ORDER BY created_at DESC").fetchall()
        tenants = [dict(r) for r in rows]
        for t in tenants:
            count = conn.execute(
                f"SELECT COUNT(*) FROM users WHERE tenant_id={_ph}", (t["id"],)
            ).fetchone()[0]
            t["user_count"] = count
    return tenants


@router.post("/tenants")
async def create_tenant(body: dict, user: dict = Depends(_require_super_admin)):
    tenant_id = f"tenant-{uuid.uuid4().hex[:8]}"
    with db() as conn:
        conn.execute(f"""
            INSERT INTO platform_tenants (id,name,slug,plan_id,is_active,max_users,app_name,primary_color)
            VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
        """, (
            tenant_id,
            body.get("name", "New Tenant"),
            body.get("slug", f"tenant-{uuid.uuid4().hex[:6]}"),
            body.get("plan_id", "starter"),
            1,
            body.get("max_users", 5),
            body.get("app_name", body.get("name", "New Tenant")),
            body.get("primary_color", "#f59e0b"),
        ))
        row = conn.execute(f"SELECT * FROM platform_tenants WHERE id={_ph}", (tenant_id,)).fetchone()
    return dict(row)


@router.get("/tenants/{tenant_id}")
async def get_tenant(tenant_id: str, user: dict = Depends(_require_super_admin)):
    with db() as conn:
        row = conn.execute(f"SELECT * FROM platform_tenants WHERE id={_ph}", (tenant_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Tenant not found")
        tenant = dict(row)
        users = conn.execute(
            f"SELECT id,email,name,role,is_active,created_at,phone FROM users WHERE tenant_id={_ph}", (tenant_id,)
        ).fetchall()
        tenant["users"] = [dict(u) for u in users]
    return tenant


@router.put("/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, body: dict, user: dict = Depends(_require_super_admin)):
    allowed = ["name", "slug", "domain", "plan_id", "is_active", "max_users",
               "app_name", "logo_url", "favicon_url", "primary_color",
               "secondary_color", "accent_color", "font_family", "custom_css",
               "tagline", "support_email", "support_phone", "website", "address",
               "login_bg_color", "sidebar_style"]
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(400, "No valid fields to update")
    set_clause = ", ".join(f"{k}={_ph}" for k in updates)
    values = list(updates.values()) + [tenant_id]
    with db() as conn:
        conn.execute(f"UPDATE platform_tenants SET {set_clause} WHERE id={_ph}", values)
        row = conn.execute(f"SELECT * FROM platform_tenants WHERE id={_ph}", (tenant_id,)).fetchone()
    return dict(row)


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, user: dict = Depends(_require_super_admin)):
    with db() as conn:
        conn.execute(f"DELETE FROM tenant_features WHERE tenant_id={_ph}", (tenant_id,))
        conn.execute(f"UPDATE users SET tenant_id=NULL WHERE tenant_id={_ph}", (tenant_id,))
        conn.execute(f"DELETE FROM platform_tenants WHERE id={_ph}", (tenant_id,))
    return {"message": f"Tenant {tenant_id} deleted"}


# ═══════════════════════════════════════════════════════════════════
# USER MANAGEMENT (across all tenants)
# ═══════════════════════════════════════════════════════════════════


@router.post("/users")
async def create_user(body: dict, user: dict = Depends(_require_super_admin)):
    """Create a new user (optionally assigned to a tenant)."""
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()
    password = body.get("password") or ""
    role = body.get("role", "agent")
    tenant_id = body.get("tenant_id")
    plan = body.get("plan", "professional")
    company = body.get("company", "")
    phone = body.get("phone", "")

    if not email or "@" not in email:
        raise HTTPException(400, "Valid email is required")
    if not name:
        raise HTTPException(400, "Name is required")
    if len(password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if role not in ("admin", "manager", "agent", "user", "viewer"):
        raise HTTPException(400, "Invalid role")

    new_id = f"u-{uuid.uuid4().hex[:10]}"
    hashed = pwd_context.hash(password)

    with db() as conn:
        existing = conn.execute(f"SELECT id FROM users WHERE email={_ph}", (email,)).fetchone()
        if existing:
            raise HTTPException(409, f"A user with email {email} already exists")

        # Validate tenant if specified
        if tenant_id:
            t = conn.execute(
                f"SELECT id FROM platform_tenants WHERE id={_ph}", (tenant_id,)
            ).fetchone()
            if not t:
                raise HTTPException(404, f"Tenant {tenant_id} not found")

        conn.execute(f"""
            INSERT INTO users
            (id, email, name, hashed_password, role, plan, company, phone, is_active, is_super_admin, tenant_id)
            VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
        """, (new_id, email, name, hashed, role, plan, company, phone, 1, 0, tenant_id))

        row = conn.execute(
            f"SELECT id,email,name,role,is_active,tenant_id,plan,company,phone,created_at FROM users WHERE id={_ph}",
            (new_id,),
        ).fetchone()

    logger.info("Super Admin created user %s (%s) in tenant %s", new_id, email, tenant_id or 'none')
    return dict(row)


@router.get("/users")
async def list_all_users(
    tenant_id: str = None, role: str = None, is_active: int = None,
    user: dict = Depends(_require_super_admin),
):
    """List all users across tenants with optional filters."""
    query = "SELECT id,email,name,role,is_active,tenant_id,plan,company,phone,created_at FROM users WHERE (is_super_admin=0 OR is_super_admin IS NULL)"
    params = []
    if tenant_id:
        query += f" AND tenant_id={_ph}"
        params.append(tenant_id)
    if role:
        query += f" AND role={_ph}"
        params.append(role)
    if is_active is not None:
        query += f" AND is_active={_ph}"
        params.append(is_active)
    query += " ORDER BY created_at DESC"
    with db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


@router.get("/users/{user_id}")
async def get_user_detail(user_id: str, user: dict = Depends(_require_super_admin)):
    """Get full user details."""
    with db() as conn:
        row = conn.execute(
            f"SELECT id,email,name,role,is_active,tenant_id,plan,company,phone,created_at FROM users WHERE id={_ph}",
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    return dict(row)


@router.put("/users/{user_id}")
async def update_user(user_id: str, body: dict, user: dict = Depends(_require_super_admin)):
    """Update user role, status, tenant, plan, or profile."""
    allowed = ["name", "role", "is_active", "tenant_id", "plan", "company", "phone", "email"]
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(400, "No valid fields to update")
    set_clause = ", ".join(f"{k}={_ph}" for k in updates)
    values = list(updates.values()) + [user_id]
    with db() as conn:
        conn.execute(f"UPDATE users SET {set_clause} WHERE id={_ph}", values)
        row = conn.execute(
            f"SELECT id,email,name,role,is_active,tenant_id,plan,company,phone,created_at FROM users WHERE id={_ph}",
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    logger.info("Super Admin updated user %s: %s", user_id, updates)
    return dict(row)


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(user_id: str, body: dict, user: dict = Depends(_require_super_admin)):
    """Reset a user's password (super admin only)."""
    new_password = body.get("new_password", "")
    if len(new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    hashed = pwd_context.hash(new_password)
    with db() as conn:
        existing = conn.execute(f"SELECT id,email FROM users WHERE id={_ph}", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "User not found")
        conn.execute(f"UPDATE users SET hashed_password={_ph} WHERE id={_ph}", (hashed, user_id))
    email = dict(existing).get("email", user_id)
    logger.info("Super Admin reset password for user %s (%s)", user_id, email)
    return {"message": f"Password reset for {email}"}


@router.post("/users/{user_id}/activate")
async def activate_user(user_id: str, user: dict = Depends(_require_super_admin)):
    with db() as conn:
        conn.execute(f"UPDATE users SET is_active=1 WHERE id={_ph}", (user_id,))
    return {"message": f"User {user_id} activated"}


@router.post("/users/{user_id}/deactivate")
async def deactivate_user(user_id: str, user: dict = Depends(_require_super_admin)):
    with db() as conn:
        conn.execute(f"UPDATE users SET is_active=0 WHERE id={_ph}", (user_id,))
    return {"message": f"User {user_id} deactivated"}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(_require_super_admin)):
    """Permanently delete a user."""
    with db() as conn:
        existing = conn.execute(f"SELECT id,email,is_super_admin FROM users WHERE id={_ph}", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "User not found")
        if dict(existing).get("is_super_admin"):
            raise HTTPException(403, "Cannot delete a super admin")
        conn.execute(f"DELETE FROM users WHERE id={_ph}", (user_id,))
    logger.info("Super Admin deleted user %s", user_id)
    return {"message": f"User {user_id} deleted"}


@router.post("/users/{user_id}/move-tenant")
async def move_user_to_tenant(user_id: str, body: dict, user: dict = Depends(_require_super_admin)):
    """Move a user to a different tenant."""
    new_tenant_id = body.get("tenant_id")
    with db() as conn:
        conn.execute(f"UPDATE users SET tenant_id={_ph} WHERE id={_ph}", (new_tenant_id, user_id))
    return {"message": f"User {user_id} moved to tenant {new_tenant_id}"}


# ═══════════════════════════════════════════════════════════════════
# FEATURE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════


@router.get("/features")
async def list_system_features(user: dict = Depends(_require_super_admin)):
    with db() as conn:
        rows = conn.execute("SELECT * FROM system_features ORDER BY sort_order").fetchall()
    return [dict(r) for r in rows]


@router.get("/tenants/{tenant_id}/features")
async def get_tenant_features(tenant_id: str, user: dict = Depends(_require_super_admin)):
    with db() as conn:
        features = conn.execute("SELECT * FROM system_features ORDER BY sort_order").fetchall()
        overrides = conn.execute(
            f"SELECT feature_key, enabled FROM tenant_features WHERE tenant_id={_ph}", (tenant_id,)
        ).fetchall()
    override_map = {}
    for r in overrides:
        k = r["feature_key"] if isinstance(r, dict) else r[0]
        v = r["enabled"] if isinstance(r, dict) else r[1]
        override_map[k] = v
    result = []
    for f in features:
        fd = dict(f)
        key = fd["key"]
        fd["enabled"] = bool(override_map.get(key, fd["default_enabled"]))
        fd["is_overridden"] = key in override_map
        result.append(fd)
    return result


@router.put("/tenants/{tenant_id}/features/{feature_key}")
async def toggle_tenant_feature(
    tenant_id: str, feature_key: str, body: dict,
    user: dict = Depends(_require_super_admin),
):
    enabled = 1 if body.get("enabled", True) else 0
    fid = f"tf-{uuid.uuid4().hex[:8]}"
    with db() as conn:
        existing = conn.execute(
            f"SELECT id FROM tenant_features WHERE tenant_id={_ph} AND feature_key={_ph}",
            (tenant_id, feature_key),
        ).fetchone()
        if existing:
            conn.execute(
                f"UPDATE tenant_features SET enabled={_ph} WHERE tenant_id={_ph} AND feature_key={_ph}",
                (enabled, tenant_id, feature_key),
            )
        else:
            conn.execute(f"""
                INSERT INTO tenant_features (id,tenant_id,feature_key,enabled)
                VALUES ({_ph},{_ph},{_ph},{_ph})
            """, (fid, tenant_id, feature_key, enabled))
    return {"tenant_id": tenant_id, "feature_key": feature_key, "enabled": bool(enabled)}


# ═══════════════════════════════════════════════════════════════════
# PLANS
# ═══════════════════════════════════════════════════════════════════


@router.get("/plans")
async def list_plans(user: dict = Depends(_require_super_admin)):
    with db() as conn:
        rows = conn.execute("SELECT * FROM plans ORDER BY sort_order").fetchall()
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════════════════════
# PLATFORM SUPPORT TICKETS (tenant → super admin)
# ═══════════════════════════════════════════════════════════════════


def _enrich_ticket(conn, ticket: dict) -> dict:
    """Add tenant_name, raised_by_name/email, assigned_to_name, reply_count to a ticket dict."""
    if ticket.get("tenant_id"):
        t = conn.execute(
            f"SELECT name FROM platform_tenants WHERE id={_ph}", (ticket["tenant_id"],)
        ).fetchone()
        if t:
            ticket["tenant_name"] = dict(t).get("name")
    if ticket.get("raised_by"):
        u = conn.execute(
            f"SELECT name, email FROM users WHERE id={_ph}", (ticket["raised_by"],)
        ).fetchone()
        if u:
            ud = dict(u)
            ticket["raised_by_name"] = ud.get("name")
            ticket["raised_by_email"] = ud.get("email")
    if ticket.get("assigned_to"):
        u = conn.execute(
            f"SELECT name FROM users WHERE id={_ph}", (ticket["assigned_to"],)
        ).fetchone()
        if u:
            ticket["assigned_to_name"] = dict(u).get("name")
    rc = conn.execute(
        f"SELECT COUNT(*) FROM platform_ticket_replies WHERE ticket_id={_ph}", (ticket["id"],)
    ).fetchone()[0]
    ticket["reply_count"] = rc
    return ticket


@router.get("/tickets")
async def list_platform_tickets(
    status: str = None,
    priority: str = None,
    tenant_id: str = None,
    category: str = None,
    user: dict = Depends(_require_super_admin),
):
    """List all platform support tickets across tenants."""
    query = "SELECT * FROM platform_tickets WHERE 1=1"
    params = []
    if status:
        query += f" AND status={_ph}"
        params.append(status)
    if priority:
        query += f" AND priority={_ph}"
        params.append(priority)
    if tenant_id:
        query += f" AND tenant_id={_ph}"
        params.append(tenant_id)
    if category:
        query += f" AND category={_ph}"
        params.append(category)
    query += " ORDER BY created_at DESC"
    with db() as conn:
        rows = conn.execute(query, params).fetchall()
        tickets = [_enrich_ticket(conn, dict(r)) for r in rows]

        # Counts by status (for inbox sidebar)
        counts = {}
        for st in ("open", "in_progress", "waiting_tenant", "resolved", "closed"):
            c = conn.execute(
                f"SELECT COUNT(*) FROM platform_tickets WHERE status={_ph}", (st,)
            ).fetchone()[0]
            counts[st] = c

    return {
        "tickets": tickets,
        "total": len(tickets),
        "counts_by_status": counts,
    }


@router.get("/tickets/{ticket_id}")
async def get_platform_ticket(ticket_id: str, user: dict = Depends(_require_super_admin)):
    """Get full ticket detail with reply thread."""
    with db() as conn:
        row = conn.execute(
            f"SELECT * FROM platform_tickets WHERE id={_ph}", (ticket_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Ticket not found")
        ticket = _enrich_ticket(conn, dict(row))

        # Fetch replies + author info
        reply_rows = conn.execute(
            f"SELECT * FROM platform_ticket_replies WHERE ticket_id={_ph} ORDER BY created_at ASC",
            (ticket_id,),
        ).fetchall()
        replies = []
        for r in reply_rows:
            rd = dict(r)
            if rd.get("author_id"):
                u = conn.execute(
                    f"SELECT name, email FROM users WHERE id={_ph}", (rd["author_id"],)
                ).fetchone()
                if u:
                    ud = dict(u)
                    rd["author_name"] = ud.get("name")
                    rd["author_email"] = ud.get("email")
            rd["is_super_admin"] = bool(rd.get("is_super_admin"))
            replies.append(rd)
        ticket["replies"] = replies
    return ticket


@router.put("/tickets/{ticket_id}")
async def update_platform_ticket(
    ticket_id: str, body: dict, user: dict = Depends(_require_super_admin)
):
    """Update ticket status, priority, or assignment."""
    allowed = ["status", "priority", "assigned_to"]
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(400, "No valid fields to update")
    set_clause = ", ".join(f"{k}={_ph}" for k in updates)
    values = list(updates.values()) + [ticket_id]
    with db() as conn:
        existing = conn.execute(
            f"SELECT id FROM platform_tickets WHERE id={_ph}", (ticket_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Ticket not found")
        conn.execute(
            f"UPDATE platform_tickets SET {set_clause} WHERE id={_ph}", values
        )
        row = conn.execute(
            f"SELECT * FROM platform_tickets WHERE id={_ph}", (ticket_id,)
        ).fetchone()
        ticket = _enrich_ticket(conn, dict(row))
    logger.info("Super Admin updated ticket %s: %s", ticket_id, updates)

    # Real-time broadcast to super admins + the owning tenant
    try:
        from api.realtime import manager
        await manager.to_super_admins("ticket.updated", ticket)
        if ticket.get("tenant_id"):
            await manager.to_tenant(ticket["tenant_id"], "ticket.updated", ticket)
    except Exception as exc:
        logger.warning("WS broadcast (ticket.updated) failed: %s", exc)

    return ticket


@router.post("/tickets/{ticket_id}/reply")
async def reply_to_platform_ticket(
    ticket_id: str, body: dict, user: dict = Depends(_require_super_admin)
):
    """Super admin posts a reply to a platform ticket."""
    reply_body = (body.get("body") or "").strip()
    if not reply_body:
        raise HTTPException(400, "Reply body cannot be empty")

    reply_id = f"ptr-{uuid.uuid4().hex[:10]}"
    with db() as conn:
        existing = conn.execute(
            f"SELECT id, status FROM platform_tickets WHERE id={_ph}", (ticket_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Ticket not found")

        conn.execute(f"""
            INSERT INTO platform_ticket_replies
            (id, ticket_id, author_id, is_super_admin, body)
            VALUES ({_ph},{_ph},{_ph},{_ph},{_ph})
        """, (reply_id, ticket_id, user["id"], 1, reply_body))

        # Auto-advance status: open → in_progress when super admin first replies
        if dict(existing).get("status") == "open":
            conn.execute(
                f"UPDATE platform_tickets SET status='in_progress' WHERE id={_ph}", (ticket_id,)
            )

        # Look up tenant_id for the broadcast
        t_row = conn.execute(
            f"SELECT tenant_id FROM platform_tickets WHERE id={_ph}", (ticket_id,)
        ).fetchone()
        ticket_tenant_id = dict(t_row).get("tenant_id") if t_row else None

    payload = {
        "id": reply_id, "ticket_id": ticket_id, "body": reply_body,
        "is_super_admin": True, "author_id": user["id"], "author_name": user.get("name"),
    }
    try:
        from api.realtime import manager
        await manager.to_super_admins("ticket.reply.created", payload)
        if ticket_tenant_id:
            await manager.to_tenant(ticket_tenant_id, "ticket.reply.created", payload)
    except Exception as exc:
        logger.warning("WS broadcast (ticket.reply.created) failed: %s", exc)

    return payload


@router.post("/tickets/{ticket_id}/resolve")
async def resolve_platform_ticket(
    ticket_id: str, user: dict = Depends(_require_super_admin)
):
    """Mark a ticket as resolved (sets resolved_at timestamp)."""
    import datetime
    now_iso = datetime.datetime.utcnow().isoformat()
    with db() as conn:
        existing = conn.execute(
            f"SELECT id FROM platform_tickets WHERE id={_ph}", (ticket_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Ticket not found")
        conn.execute(
            f"UPDATE platform_tickets SET status='resolved', resolved_at={_ph} WHERE id={_ph}",
            (now_iso, ticket_id),
        )
    logger.info("Super Admin resolved ticket %s", ticket_id)

    # Broadcast resolve event
    try:
        from api.realtime import manager
        with db() as conn:
            t_row = conn.execute(
                f"SELECT tenant_id FROM platform_tickets WHERE id={_ph}", (ticket_id,)
            ).fetchone()
            t_tid = dict(t_row).get("tenant_id") if t_row else None
        payload = {"id": ticket_id, "status": "resolved", "resolved_at": now_iso}
        await manager.to_super_admins("ticket.resolved", payload)
        if t_tid:
            await manager.to_tenant(t_tid, "ticket.resolved", payload)
    except Exception as exc:
        logger.warning("WS broadcast (ticket.resolved) failed: %s", exc)

    return {"message": f"Ticket {ticket_id} resolved", "resolved_at": now_iso}
