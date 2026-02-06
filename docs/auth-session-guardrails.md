# Auth/Session Guardrails (for AI-assisted edits)

If you change anything related to login, cookies, password hashing, or origin checks, use this checklist.

## Must-run check

```bash
pnpm test:security
```

## Invariants to preserve

- Password verification stays constant-time (`timingSafeEqual`) and uses `scrypt`.
- Session cookie is `payload.signature` where signature is `HMAC-SHA256(payload)`.
- `verifySessionCookie()` rejects tampered cookies and expired cookies.
- Server cookies remain `HttpOnly` and set `SameSite` (and `Secure` when the request is secure).

## Quick manual smoke test (local)

1. Start API: `pnpm dzzenos:api`
2. Open `/login`, sign in, then hit `/auth/verify` (should return 200).
3. Logout and re-check `/auth/verify` (should return 401).

## Smoke test overrides (when login flow changes)

You can adjust the smoke test without editing code by setting env vars:

- `DZZENOS_AUTH_LOGIN_PATH` (default `/auth/login`)
- `DZZENOS_AUTH_READY_PATH` (default `/login`)
- `DZZENOS_AUTH_VERIFY_PATH` (default `/auth/verify`)
- `DZZENOS_AUTH_LOGOUT_PATH` (default `/auth/logout`)
- `DZZENOS_AUTH_USERNAME_FIELD` (default `username`)
- `DZZENOS_AUTH_PASSWORD_FIELD` (default `password`)
