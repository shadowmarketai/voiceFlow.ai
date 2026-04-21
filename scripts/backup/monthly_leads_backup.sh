#!/bin/bash
# ============================================
# VoiceFlow AI — Monthly Leads Database Backup
# ============================================
# Run on VPS via cron: 0 2 1 * * /path/to/monthly_leads_backup.sh
#
# Creates:
#   1. Full SQL dump (.sql.gz)
#   2. CSV exports per table (.zip)
#   3. Nested JSON export (.json.gz)
#   4. MANIFEST.txt with counts + checksums
#   5. GPG-encrypted archive (.tar.gz.gpg)
# ============================================

set -euo pipefail

# ===== CONFIG =====
DB_HOST="${LEADS_DB_HOST:-localhost}"
DB_PORT="${LEADS_DB_PORT:-5432}"
DB_NAME="${LEADS_DB_NAME:-shadowmarket_leads}"
DB_USER="${LEADS_DB_USER:-voiceflow}"
export PGPASSWORD="${LEADS_DB_PASSWORD:-voiceflow_prod_secret_2026}"

DATE=$(date +%Y-%m-%d)
MONTH=$(date +%Y-%m)
BACKUP_ROOT="${BACKUP_ROOT:-/home/backups/leads}"
BACKUP_DIR="${BACKUP_ROOT}/${MONTH}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$BACKUP_DIR"

echo "==> Starting leads backup for ${MONTH}"

# ===== 1. FULL SQL DUMP =====
echo "[1/5] pg_dump full database..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-acl --clean --if-exists \
    | gzip -9 > "${BACKUP_DIR}/full_dump_${DATE}.sql.gz"

# ===== 2. CSV EXPORTS PER TABLE =====
echo "[2/5] CSV exports per table..."
mkdir -p "${BACKUP_DIR}/csv"
TABLES=("leads" "lead_interactions" "lead_custom_fields" "lead_tags" "crm_connections" "ad_source_connections" "sync_logs")
for tbl in "${TABLES[@]}"; do
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "\COPY ${tbl} TO '${BACKUP_DIR}/csv/${tbl}_${DATE}.csv' WITH CSV HEADER" 2>/dev/null || true
done
(cd "${BACKUP_DIR}" && zip -qr "csv_${DATE}.zip" csv && rm -rf csv)

# ===== 3. JSON EXPORT WITH RELATIONSHIPS =====
echo "[3/5] JSON nested export..."
python3 "${SCRIPT_DIR}/leads_to_json.py" \
    --host "$DB_HOST" --port "$DB_PORT" --dbname "$DB_NAME" --user "$DB_USER" \
    --output "${BACKUP_DIR}/leads_nested_${DATE}.json.gz" || echo "JSON export skipped (python3 or psycopg2 not available)"

# ===== 4. METADATA + CHECKSUMS =====
echo "[4/5] Generating manifest..."
LEAD_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tAc "SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL" 2>/dev/null || echo "0")
INTERACTION_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -tAc "SELECT COUNT(*) FROM lead_interactions" 2>/dev/null || echo "0")

cat > "${BACKUP_DIR}/MANIFEST.txt" <<EOF
Shadow Market / VoiceFlow AI — Leads Backup
============================================
Date: ${DATE}
Database: ${DB_NAME}
Active leads: ${LEAD_COUNT}
Total interactions: ${INTERACTION_COUNT}

Files:
$(cd "$BACKUP_DIR" && ls -lh 2>/dev/null)

SHA256 Checksums:
$(cd "$BACKUP_DIR" && sha256sum *.gz *.zip 2>/dev/null || true)
EOF

# ===== 5. CREATE FINAL ARCHIVE =====
echo "[5/5] Creating archive..."
cd "$BACKUP_ROOT"
tar czf "leads_backup_${MONTH}.tar.gz" "${MONTH}/"
SIZE=$(du -h "leads_backup_${MONTH}.tar.gz" | cut -f1)

# Optional: GPG encrypt
if command -v gpg &>/dev/null && [ -n "${BACKUP_GPG_PASSPHRASE:-}" ]; then
    echo "$BACKUP_GPG_PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 \
        --symmetric --cipher-algo AES256 "leads_backup_${MONTH}.tar.gz"
    rm "leads_backup_${MONTH}.tar.gz"
    echo "==> Encrypted: leads_backup_${MONTH}.tar.gz.gpg (${SIZE})"
else
    echo "==> Archive: leads_backup_${MONTH}.tar.gz (${SIZE})"
fi

echo "==> Backup complete!"
echo "==> Active leads: ${LEAD_COUNT}"
echo "==> Interactions: ${INTERACTION_COUNT}"

# ===== 6. NOTIFY (optional) =====
if [ -n "${BACKUP_WEBHOOK_URL:-}" ]; then
    curl -s -X POST "$BACKUP_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{\"month\":\"${MONTH}\",\"size\":\"${SIZE}\",\"leads\":${LEAD_COUNT},\"interactions\":${INTERACTION_COUNT}}" || true
fi
