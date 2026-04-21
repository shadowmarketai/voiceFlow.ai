#!/bin/bash
# ============================================
# VoiceFlow AI — Pull Monthly Backup to Local
# ============================================
# Run on your Mac after the VPS cron has completed (2nd of every month)
#
# Usage:
#   ./pull_leads_backup.sh
#   ./pull_leads_backup.sh 2026-04    # specific month
# ============================================

set -euo pipefail

MONTH="${1:-$(date +%Y-%m)}"
LOCAL_DIR="$HOME/Backups/VoiceFlowAI/Leads"
EXTERNAL_HDD="/Volumes/ShadowMarketBackup/Leads"
VPS_USER="${VPS_USER:-root}"
VPS_HOST="${VPS_HOST:-your-vps-host}"
REMOTE_DIR="/home/backups/leads"

# Check if encrypted version exists
REMOTE_FILE="${REMOTE_DIR}/leads_backup_${MONTH}.tar.gz"
REMOTE_FILE_GPG="${REMOTE_DIR}/leads_backup_${MONTH}.tar.gz.gpg"

mkdir -p "$LOCAL_DIR"

echo "==> Pulling leads backup for ${MONTH}..."

# Try encrypted first, fall back to plain
if ssh "${VPS_USER}@${VPS_HOST}" "test -f ${REMOTE_FILE_GPG}" 2>/dev/null; then
    REMOTE="${REMOTE_FILE_GPG}"
    LOCAL="${LOCAL_DIR}/leads_backup_${MONTH}.tar.gz.gpg"
elif ssh "${VPS_USER}@${VPS_HOST}" "test -f ${REMOTE_FILE}" 2>/dev/null; then
    REMOTE="${REMOTE_FILE}"
    LOCAL="${LOCAL_DIR}/leads_backup_${MONTH}.tar.gz"
else
    echo "==> ERROR: No backup found for ${MONTH} on ${VPS_HOST}"
    exit 1
fi

rsync -avz --progress \
    "${VPS_USER}@${VPS_HOST}:${REMOTE}" \
    "${LOCAL}"

# Verify checksum
echo "==> Verifying integrity..."
REMOTE_SUM=$(ssh "${VPS_USER}@${VPS_HOST}" "sha256sum ${REMOTE}" | awk '{print $1}')
LOCAL_SUM=$(shasum -a 256 "${LOCAL}" | awk '{print $1}')

if [ "$REMOTE_SUM" = "$LOCAL_SUM" ]; then
    echo "==> Checksum match"
else
    echo "==> CHECKSUM MISMATCH — re-download"
    exit 1
fi

# Copy to external HDD if mounted
if [ -d "/Volumes/ShadowMarketBackup" ]; then
    echo "==> Copying to external HDD..."
    mkdir -p "$EXTERNAL_HDD"
    cp "${LOCAL}" "${EXTERNAL_HDD}/"
    echo "==> External HDD copy complete"
else
    echo "==> External HDD not mounted — skipping"
fi

echo ""
echo "==> Done!"
echo "==> Local:    ${LOCAL}"
echo "==> Size:     $(du -h "${LOCAL}" | cut -f1)"
