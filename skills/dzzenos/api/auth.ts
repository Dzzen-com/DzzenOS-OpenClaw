import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type AuthConfigV1 = {
  version: 1;
  username: string;
  password: {
    // scrypt
    salt: string; // hex
    hash: string; // hex
    params: { N: number; r: number; p: number; keylen: number };
  };
  cookie: {
    secret: string; // hex, 32 bytes
    name: string;
    ttlSeconds: number;
  };
};

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_PASSWORD_POLICY = 'strict';

function enforcePasswordPolicy(password: string, policy: string) {
  const p = policy?.trim().toLowerCase() || DEFAULT_PASSWORD_POLICY;
  if (p === 'none') return;

  if (p === 'moderate') {
    const ok =
      password.length >= 10 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password);
    if (!ok) {
      throw new Error(
        'password policy: at least 10 chars with upper, lower, and number'
      );
    }
    return;
  }

  // strict (default)
  const ok =
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
  if (!ok) {
    throw new Error(
      'password policy: at least 12 chars with upper, lower, number, and symbol'
    );
  }
}

export function defaultAuthFile(repoRoot: string): string {
  return path.join(repoRoot, 'data', 'auth.json');
}

export function loadAuthConfig(filePath: string): AuthConfigV1 | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    if (typeof parsed.username !== 'string' || !parsed.username.trim()) return null;
    if (!parsed.password || typeof parsed.password.salt !== 'string' || typeof parsed.password.hash !== 'string') return null;
    if (!parsed.cookie || typeof parsed.cookie.secret !== 'string') return null;
    const ttlSeconds =
      typeof parsed.cookie.ttlSeconds === 'number' ? parsed.cookie.ttlSeconds : DEFAULT_TTL_SECONDS;
    const name = typeof parsed.cookie.name === 'string' && parsed.cookie.name.trim() ? parsed.cookie.name.trim() : 'dzzenos_session';

    return {
      version: 1,
      username: parsed.username.trim(),
      password: {
        salt: parsed.password.salt,
        hash: parsed.password.hash,
        params: {
          N: Number(parsed.password.params?.N ?? 16384),
          r: Number(parsed.password.params?.r ?? 8),
          p: Number(parsed.password.params?.p ?? 1),
          keylen: Number(parsed.password.params?.keylen ?? 64),
        },
      },
      cookie: {
        secret: parsed.cookie.secret,
        name,
        ttlSeconds,
      },
    };
  } catch {
    return null;
  }
}

export function ensureDirForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function createAuthConfig(params: {
  username: string;
  password: string;
  cookieName?: string;
  ttlSeconds?: number;
  passwordPolicy?: string;
}): AuthConfigV1 {
  const username = params.username.trim();
  if (!username) throw new Error('username is required');
  if (!params.password) throw new Error('password is required');

  enforcePasswordPolicy(params.password, params.passwordPolicy ?? DEFAULT_PASSWORD_POLICY);

  const salt = crypto.randomBytes(16);
  const keylen = 64;
  const scryptParams = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
  const hash = crypto.scryptSync(params.password, salt, keylen, scryptParams);

  const secret = crypto.randomBytes(32);

  return {
    version: 1,
    username,
    password: {
      salt: salt.toString('hex'),
      hash: hash.toString('hex'),
      params: { N: 16384, r: 8, p: 1, keylen },
    },
    cookie: {
      secret: secret.toString('hex'),
      name: params.cookieName?.trim() || 'dzzenos_session',
      ttlSeconds: params.ttlSeconds ?? DEFAULT_TTL_SECONDS,
    },
  };
}

export function saveAuthConfig(filePath: string, cfg: AuthConfigV1) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlToBuf(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

export function verifyPassword(cfg: AuthConfigV1, password: string): boolean {
  const salt = Buffer.from(cfg.password.salt, 'hex');
  const expected = Buffer.from(cfg.password.hash, 'hex');
  const keylen = cfg.password.params.keylen;
  const scryptParams = { N: cfg.password.params.N, r: cfg.password.params.r, p: cfg.password.params.p, maxmem: 64 * 1024 * 1024 };
  const actual = crypto.scryptSync(password, salt, keylen, scryptParams);
  return crypto.timingSafeEqual(expected, actual);
}

export function signSessionCookie(cfg: AuthConfigV1, username: string): { value: string; expiresAtMs: number } {
  const exp = Date.now() + cfg.cookie.ttlSeconds * 1000;
  const payload = Buffer.from(JSON.stringify({ u: username, exp }));
  const secret = Buffer.from(cfg.cookie.secret, 'hex');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest();
  const value = `${b64url(payload)}.${b64url(sig)}`;
  return { value, expiresAtMs: exp };
}

export function verifySessionCookie(cfg: AuthConfigV1, cookieValue: string): { username: string } | null {
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const payload = b64urlToBuf(parts[0]);
  const sig = b64urlToBuf(parts[1]);
  const secret = Buffer.from(cfg.cookie.secret, 'hex');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  if (expected.length !== sig.length || !crypto.timingSafeEqual(expected, sig)) return null;
  try {
    const parsed = JSON.parse(payload.toString('utf8'));
    if (!parsed || typeof parsed.u !== 'string' || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) return null;
    return { username: parsed.u };
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  const parts = header.split(/;\s*/g);
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}
