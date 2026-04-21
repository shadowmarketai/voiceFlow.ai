"""
VoiceFlow AI — Leads nested JSON export.
Exports all leads with their interactions, custom fields, and tags
into a single JSON file (gzipped).
"""

import argparse
import gzip
import json
import os
from datetime import date, datetime
from decimal import Decimal

import psycopg2
import psycopg2.extras


def serialize(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Cannot serialize {type(obj)}")


def main():
    parser = argparse.ArgumentParser(description="Export leads to nested JSON")
    parser.add_argument("--host", default=os.environ.get("LEADS_DB_HOST", "localhost"))
    parser.add_argument("--port", default=os.environ.get("LEADS_DB_PORT", "5432"))
    parser.add_argument("--dbname", default=os.environ.get("LEADS_DB_NAME", "shadowmarket_leads"))
    parser.add_argument("--user", default=os.environ.get("LEADS_DB_USER", "voiceflow"))
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    password = os.environ.get("PGPASSWORD", os.environ.get("LEADS_DB_PASSWORD", ""))

    conn = psycopg2.connect(
        host=args.host,
        port=args.port,
        dbname=args.dbname,
        user=args.user,
        password=password,
    )
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Load all active leads
    cur.execute("SELECT * FROM leads WHERE deleted_at IS NULL ORDER BY created_at")
    leads = [dict(r) for r in cur.fetchall()]

    # Attach related records
    for lead in leads:
        lid = lead["id"]

        cur.execute(
            "SELECT * FROM lead_interactions WHERE lead_id = %s ORDER BY created_at",
            (lid,),
        )
        lead["interactions"] = [dict(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT field_key, field_value FROM lead_custom_fields WHERE lead_id = %s",
            (lid,),
        )
        lead["custom_fields"] = {r["field_key"]: r["field_value"] for r in cur.fetchall()}

        cur.execute("SELECT tag FROM lead_tags WHERE lead_id = %s", (lid,))
        lead["tags"] = [r["tag"] for r in cur.fetchall()]

    conn.close()

    # Write gzipped JSON
    with gzip.open(args.output, "wt", encoding="utf-8") as f:
        json.dump(
            {
                "exported_at": datetime.utcnow().isoformat(),
                "lead_count": len(leads),
                "leads": leads,
            },
            f,
            default=serialize,
            ensure_ascii=False,
            indent=2,
        )

    print(f"Exported {len(leads)} leads to {args.output}")


if __name__ == "__main__":
    main()
