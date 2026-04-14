# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately:

**Email:** security@shadowmarket.ai

Do NOT open a public GitHub issue for security vulnerabilities.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Security Measures

- **Authentication:** JWT with bcrypt password hashing
- **CORS:** Configurable allowed origins
- **Rate Limiting:** Per-IP and per-plan limits
- **Input Validation:** Pydantic schemas on all endpoints
- **SQL Injection:** SQLAlchemy parameterized queries
- **XSS:** React auto-escaping + Content-Security-Policy headers
- **Secrets:** Environment variables only (never in code)
- **HTTPS:** Required in production
- **Webhook Verification:** HMAC signature validation per provider

## Dependency Auditing

```bash
pip-audit                    # Python
cd frontend && npm audit     # Node.js
```
