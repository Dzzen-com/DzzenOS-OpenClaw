# Security Best Practices Review (DzzenOS-OpenClaw)

Date: 2026-02-05  
Scope: JavaScript/TypeScript backend (`skills/dzzenos/api`) + React/Vite frontend (`apps/ui`) + install/publish scripts (`scripts/`).  
Notes/limits: This is a repo/code review (no live runtime header verification; no online dependency/CVE scanning).

## Executive summary

The project is generally careful about local-first defaults (loopback bind, UUID IDs, scrypt password hashing, `HttpOnly` cookies, login page CSP). The biggest risks are at the **browser ↔ local API trust boundary** and the **filesystem trust boundary**:

1. Several state-changing API routes accept JSON bodies regardless of `Content-Type` and do not enforce an Origin/CSRF policy. This enables **cross-site request attacks against a locally-running API** (a malicious website can trigger writes to the local DzzenOS API without reading responses).
2. The docs endpoints build filesystem paths from attacker-controlled `boardId` segments without validation, enabling **path traversal** (read/write of arbitrary `.md` / `changelog.md` paths).
3. The API intentionally relies on an external reverse-proxy (`forward_auth`) for auth; if the API port is exposed beyond loopback, it becomes effectively unauthenticated.

## Stack overview (for threat modeling)

- Backend: Node `node:http` server + `node:sqlite` (`skills/dzzenos/api/server.ts`).
- Frontend: Vite + React (`apps/ui`).
- Deployment: local dev (direct API on `127.0.0.1`) and optional domain mode via Caddy reverse proxy + `forward_auth` (`scripts/setup-domain.sh`).

## Positive security posture (what’s already good)

- Password storage uses `scrypt` + `timingSafeEqual` (`skills/dzzenos/api/auth.ts`).
- Auth cookie is `HttpOnly` and uses `SameSite` with optional `Secure` when HTTPS is detected (`skills/dzzenos/api/server.ts`).
- Login page sets strong security headers including CSP and clickjacking defenses (`skills/dzzenos/api/server.ts`).
- IDs are random UUIDs rather than incrementing IDs (`skills/dzzenos/api/server.ts`).

---

## Critical findings

### DZZENOS-SEC-001 — Cross-site requests can mutate local API state (CSRF-like localhost attack)

Severity: **Critical**  
Impact (1 sentence): **Any website the user visits can trigger state-changing requests to a locally-running DzzenOS API, causing unintended data changes and enabling follow-on abuse (notably file writes via docs endpoints).**

Location:
- `skills/dzzenos/api/server.ts:151` (`readJson`) and broad usage across POST/PATCH/PUT/DELETE handlers.

Evidence:

`readJson()` accepts and parses JSON regardless of `Content-Type`:
```ts
// skills/dzzenos/api/server.ts:151
async function readJson(req: http.IncomingMessage): Promise<any> {
  ...
  return JSON.parse(raw);
}
```

Most state-changing routes call `readJson(req)` without enforcing `Origin` (contrast: only `/auth/login` and `/auth/logout` do an origin check):
```ts
// skills/dzzenos/api/server.ts:2223
if (req.method === 'PUT' && url.pathname === '/docs/overview') {
  const body = await readJson(req);
  ...
}
```

Why this matters:
- Browsers can send “simple” cross-origin requests with `Content-Type: text/plain` **without** a CORS preflight, and `readJson()` will still parse the JSON body. CORS headers only protect *reading* responses; they are not a server-side authorization control for state changes.

Fix (secure-by-default):
- Require JSON endpoints to enforce `Content-Type`:
  - Accept only `application/json` (and optionally `application/*+json`).
  - Reject otherwise with **415 Unsupported Media Type** before reading the body.
- Add a centralized server-side CSRF/origin policy for state-changing requests:
  - For browser-facing installs, reject `POST/PATCH/PUT/DELETE` unless `Origin` is present and allowed (same-origin or configured allowlist).
  - Keep `/auth/login` as form-encoded and already origin-checked.

Mitigations (defense-in-depth):
- Bind the API to loopback only by default (already default), and refuse/require an explicit “unsafe” flag when binding to `0.0.0.0`.
- Consider a local API key (header-based) for non-browser clients as an alternative to relying on CORS.

False positive notes:
- If the API is *always* accessed only via a reverse proxy that blocks direct access (and the API is never reachable from the browser), the risk is reduced. The local dev flow in this repo *does* run the API on loopback and is reachable from the browser.

---

### DZZENOS-SEC-002 — Path traversal in docs endpoints enables arbitrary markdown reads/writes

Severity: **Critical**  
Impact (1 sentence): **An attacker can read or overwrite arbitrary `.md` files (and arbitrary `changelog.md` targets) on the API host by crafting `boardId` path segments, which is especially dangerous when combined with DZZENOS-SEC-001 or any network exposure.**

Location:
- `skills/dzzenos/api/server.ts:462` (`boardDocPath`, `boardChangelogPath`, `boardMemoryPath`)
- `skills/dzzenos/api/server.ts:2231` (GET board docs), `skills/dzzenos/api/server.ts:2237` (PUT board docs), `skills/dzzenos/api/server.ts:2247` (GET changelog), `skills/dzzenos/api/server.ts:2253` (POST summary append)

Evidence:

Paths are created from `boardId` with no validation:
```ts
// skills/dzzenos/api/server.ts:462
function boardDocPath(boardId: string) {
  return path.join(docsDir, 'boards', `${boardId}.md`);
}
function boardChangelogPath(boardId: string) {
  return path.join(docsDir, 'boards', boardId, 'changelog.md');
}
```

User-controlled `boardId` comes directly from the URL and is used to read/write:
```ts
// skills/dzzenos/api/server.ts:2237
const boardId = decodeURIComponent(boardDocsPut[1]);
...
writeTextFile(boardDocPath(boardId), content);
```

Fix (secure-by-default):
- Validate `boardId` strictly (recommended: UUID v4 format, since board IDs are generated via `randomUUID()`), and reject anything else.
- Additionally, implement a safe-join helper:
  - Resolve the final path with `path.resolve(...)`.
  - Enforce it stays within the intended base directory (prefix check with `base + path.sep`).

Mitigations (defense-in-depth):
- If you want the docs content to be associated with DB entities, consider storing docs in SQLite (or mapping IDs to filenames server-side) rather than treating URL segments as filenames.

False positive notes:
- `boardDocPath` appends `.md`, which limits *some* arbitrary overwrites, but it still allows overwriting many repo files (`README.md`, `SECURITY.md`, etc.) by choosing a `boardId` like `../../../../README`.

---

## High findings

### DZZENOS-SEC-003 — No built-in authz on API routes (relies on reverse proxy); unsafe if API is exposed

Severity: **High**  
Location: `skills/dzzenos/api/server.ts:906`

Evidence:
```ts
// skills/dzzenos/api/server.ts:906
// If no auth config exists, we keep auth endpoints usable but do not block API calls here.
```
And session verification is only implemented for `/auth/verify` (no route-level enforcement).

Impact:
- If the API port becomes reachable beyond loopback (misconfiguration, container port publish, VPS bind, etc.), routes are effectively unauthenticated and enable full read/write operations.

Fix (secure-by-default):
- Add defense-in-depth server-side auth when `auth` is configured:
  - Require a valid session cookie for all routes except `/login`, `/auth/login`, `/auth/logout`, `/auth/verify`.
- Alternatively (or additionally), refuse to bind to non-loopback unless `auth` is configured and an explicit `--public`/`DZZENOS_ALLOW_PUBLIC=1` is set.

Mitigation:
- Keep the API bound to loopback and only reachable by a reverse proxy on the same host (current domain setup does this with `API_HOST=127.0.0.1`).

---

### DZZENOS-SEC-004 — Auth token is taken from URL query string (`?token=`), which is leak-prone

Severity: **High**  
Location: `apps/ui/src/api/openclaw.ts:6`

Evidence:
```ts
// apps/ui/src/api/openclaw.ts:6
return new URLSearchParams(window.location.search).get('token') ?? '';
```

Impact:
- Tokens in URLs commonly leak via browser history, copy/paste, screenshots, server logs, and `Referer` headers (unless a strict `Referrer-Policy` is guaranteed everywhere the UI is served).

Fix (secure-by-default):
- Prefer one of:
  - A short-lived token exchange via a backend (best for real deployments).
  - Store the token in `sessionStorage` and immediately remove it from the URL (e.g., `history.replaceState`) on first load.
  - Use the URL fragment (`#token=...`) rather than query params to reduce `Referer` leakage (still leaks via history; fragment handling must be careful).

Mitigation:
- Ensure the UI is always served with `Referrer-Policy: no-referrer` at the edge (domain setup does this in Caddy; local mode may not).

---

## Medium findings

### DZZENOS-SEC-005 — Shell injection risk in `publish-canvas` script (env → shell string)

Severity: **Medium**  
Location: `scripts/publish-canvas.mjs:34`

Evidence:
```js
// scripts/publish-canvas.mjs:34
const env = `VITE_API_BASE=${JSON.stringify(apiBase)}...`;
execSync(`${env} corepack pnpm -C apps/ui build`, { stdio: 'inherit' });
```

Impact:
- If a user (or automation) sets `DZZENOS_API_BASE` / `VITE_API_BASE` to a value containing shell expansions (e.g. `$()`), it may execute unintended commands because a shell is invoked.

Fix:
- Avoid the shell: use `execFileSync('corepack', ['pnpm', '-C', 'apps/ui', 'build'], { env: { ...process.env, VITE_API_BASE: apiBase, ... } })`.

---

### DZZENOS-SEC-006 — No request body size limits in Node API (DoS risk if reachable)

Severity: **Medium**  
Location: `skills/dzzenos/api/server.ts:151` (`readJson`) and `/auth/login` form parsing.

Evidence:
- `readJson` buffers the entire body in memory with no cap.

Impact:
- Large request bodies can cause memory pressure and process instability if the API is reachable by untrusted clients.

Fix:
- Add a maximum body size (e.g., 1–5MB) with early abort and 413 response.
- Keep/extend the reverse-proxy body limit in `scripts/setup-domain.sh` (already sets `request_body max_size 10MB` in Caddy).

---

### DZZENOS-SEC-007 — Proxy headers are trusted without explicit trust configuration

Severity: **Medium**  
Locations:
- `skills/dzzenos/api/server.ts:237` (`x-forwarded-proto`)
- `skills/dzzenos/api/server.ts:1050` (`x-forwarded-for`)

Evidence:
```ts
// skills/dzzenos/api/server.ts:237
const xf = String(req.headers['x-forwarded-proto'] ?? '');
```
```ts
// skills/dzzenos/api/server.ts:1050
const ipRaw = String((req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '') as any);
```

Impact:
- If the API is reachable directly (not only through a trusted proxy that overwrites these headers), clients can spoof them, affecting security decisions (cookie `Secure` flag, brute-force rate limiting buckets, and same-origin base computation).

Fix:
- Add a `DZZENOS_TRUST_PROXY=1` (or similar) guard:
  - Only consult `X-Forwarded-*` headers when enabled; otherwise rely on socket info.
  - Optionally restrict trust to known proxy IPs.

---

## Low findings / hygiene

### DZZENOS-SEC-008 — `data/auth.json` is not gitignored (risk of accidentally committing secrets)

Severity: **Low** (can become High if committed)  
Locations:
- `skills/dzzenos/api/auth.ts:56` (default location)
- `.gitignore:15` (does not include it)

Evidence:
- Default auth file path is under `data/auth.json` but `.gitignore` only ignores `data/*.db`.

Impact:
- `data/auth.json` contains the password hash and cookie signing secret; accidental commits would be a security incident.

Fix:
- Add to `.gitignore`:
  - `/data/auth.json`
  - `/data/workspace/` (contains user docs/memory artifacts)

---

### DZZENOS-SEC-009 — Cookie parsing can throw on malformed percent-encoding

Severity: **Low**  
Location: `skills/dzzenos/api/auth.ts:190`

Evidence:
```ts
// skills/dzzenos/api/auth.ts:200
out[k] = decodeURIComponent(v);
```

Impact:
- A malformed cookie value can throw and turn an auth check into a 500 (availability / log noise).

Fix:
- Wrap `decodeURIComponent` in a `try/catch` per cookie value and skip invalid values.

---

## Recommended fix order

1. **DZZENOS-SEC-001**: enforce JSON `Content-Type` + server-side Origin/CSRF policy for state changes.
2. **DZZENOS-SEC-002**: validate/safe-join `boardId` for docs file paths.
3. **DZZENOS-SEC-003**: add defense-in-depth auth enforcement when `auth` exists and/or refuse public binds by default.
4. **DZZENOS-SEC-004**: move away from `?token=`; strip it from URL after first load at minimum.
5. Medium/low hygiene items as time allows.

