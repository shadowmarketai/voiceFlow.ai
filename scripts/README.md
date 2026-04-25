# scripts/

Utility scripts for managing and operating this template.

## Files

### `new-client.sh`

Initialize a freshly forked template for a new project. Substitutes `{{PROJECT_NAME}}` placeholders, renames `frontend/package.json`, creates `memory/project-state.md`, optionally resets git history.

```bash
./scripts/new-client.sh "Acme HRMS"           # slug auto-derived
./scripts/new-client.sh "Livvly" livvly-app   # explicit slug
```

Also invocable via the `/new-client` slash command in Claude Code.

### `_gen_migration.py`

Helper for generating Alembic migrations. Typically invoked via:

```bash
cd backend
python ../scripts/_gen_migration.py "<migration description>"
```

Wraps `alembic revision --autogenerate` with project-specific defaults (imports all models from `app.models`, loads `.env` for DB URL).

### `hooks/`

Shell hooks wired into `hooks/hooks.json` at the repo root. Do not call directly — Claude Code invokes them on pre-commit, session-start, and after-edit events.

### `lib/`

Shared Python utilities used by scripts in this directory. Not part of the application runtime.

## Conventions

- All scripts must be POSIX sh / bash compatible (no zsh-only syntax)
- Scripts that mutate repo state must be idempotent or print a warning when re-run
- File paths must be relative to the repo root, not to `scripts/`
