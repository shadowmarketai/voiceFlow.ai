#!/usr/bin/env bash
# new-client.sh — initialize a forked template for a new project.
# Usage:   ./scripts/new-client.sh <ProjectName> [slug]
# Example: ./scripts/new-client.sh "Acme HRMS" acme-hrms

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <ProjectName> [slug]" >&2
  echo "  ProjectName: human-readable (e.g. \"Acme HRMS\")" >&2
  echo "  slug       : optional kebab-case (e.g. acme-hrms). Derived from ProjectName if omitted." >&2
  exit 1
fi

PROJECT_NAME="$1"
SLUG="${2:-$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')}"

echo "Project name : $PROJECT_NAME"
echo "Slug         : $SLUG"
echo ""

# Portable in-place sed (BSD/macOS vs GNU/Linux)
sed_inplace() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

# 1. Substitute {{PROJECT_NAME}} in key files
echo "[1/4] Substituting {{PROJECT_NAME}} placeholders..."
for f in CLAUDE.md README.md .env.example; do
  if [ -f "$f" ] && grep -q "{{PROJECT_NAME}}" "$f"; then
    sed_inplace "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "$f"
    echo "       substituted in $f"
  fi
done

# 2. Rename package.json name
if [ -f "frontend/package.json" ]; then
  echo "[2/4] Renaming frontend/package.json..."
  sed_inplace "s/\"name\": \"[^\"]*\"/\"name\": \"${SLUG}-frontend\"/" frontend/package.json
  echo "       name → ${SLUG}-frontend"
fi

# 3. Create memory dir for brownfield skill
echo "[3/4] Initializing memory/..."
mkdir -p memory
cat > memory/project-state.md <<EOF
# Project State

**Project:** $PROJECT_NAME
**Slug:** $SLUG
**Initialized:** $(date +%Y-%m-%d)

## Current status
Fresh fork. No features built yet.

## Next steps
1. Edit .env with DB creds + SECRET_KEY
2. Run \`cd backend && alembic revision --autogenerate -m "initial_users" && alembic upgrade head\`
3. Run \`cd frontend && npm install\`
4. In Claude: \`/onboard-repo\` then \`/generate-prp\`

## Decisions log
(Log major architectural choices here as they happen.)
EOF
echo "       wrote memory/project-state.md"

# 4. Reset git history (optional; prompt)
read -r -p "[4/4] Reset git history so this fork has a clean initial commit? (y/N): " RESET
if [[ "${RESET:-N}" =~ ^[Yy]$ ]]; then
  rm -rf .git
  git init -q
  git add .
  git commit -q -m "chore: initialize $PROJECT_NAME from Shadow Market template"
  echo "       git history reset; initial commit created"
else
  echo "       git history kept; you can \`git commit -am 'chore: rename to $PROJECT_NAME'\` manually"
fi

echo ""
echo "Done. $PROJECT_NAME is ready."
echo "Next: open this folder in Claude Code and run /onboard-repo."
