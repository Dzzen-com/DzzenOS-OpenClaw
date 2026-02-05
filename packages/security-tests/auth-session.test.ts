import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import {
  createAuthConfig,
  parseCookies,
  saveAuthConfig,
  signSessionCookie,
  verifyPassword,
  verifySessionCookie,
} from '../../skills/dzzenos/api/auth.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const AUTH_READY_PATH = process.env.DZZENOS_AUTH_READY_PATH ?? '/login';
const AUTH_LOGIN_PATH = process.env.DZZENOS_AUTH_LOGIN_PATH ?? '/auth/login';
const AUTH_VERIFY_PATH = process.env.DZZENOS_AUTH_VERIFY_PATH ?? '/auth/verify';
const AUTH_LOGOUT_PATH = process.env.DZZENOS_AUTH_LOGOUT_PATH ?? '/auth/logout';
const AUTH_USERNAME_FIELD = process.env.DZZENOS_AUTH_USERNAME_FIELD ?? 'username';
const AUTH_PASSWORD_FIELD = process.env.DZZENOS_AUTH_PASSWORD_FIELD ?? 'password';

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close(() => reject(new Error('Failed to get free port')));
        return;
      }
      const { port } = addr;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ignore and retry
    }
    await delay(150);
  }
  throw new Error(`Server did not become ready: ${url}`);
}

async function stopProcess(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    child.once('exit', done);
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 2000);
  });
}

test('createAuthConfig enforces password policy by default (strict)', () => {
  assert.throws(
    () => createAuthConfig({ username: 'u', password: 'weak', passwordPolicy: undefined }),
    /password policy/i
  );
});

test('verifyPassword accepts correct password and rejects wrong password', () => {
  const cfg = createAuthConfig({
    username: 'u',
    password: 'A_strong1!password',
  });

  assert.equal(verifyPassword(cfg, 'A_strong1!password'), true);
  assert.equal(verifyPassword(cfg, 'A_strong1!passwordX'), false);
});

test('signSessionCookie + verifySessionCookie round-trip and reject tampering', () => {
  const cfg = createAuthConfig({
    username: 'u',
    password: 'A_strong1!password',
    ttlSeconds: 60,
  });

  const signed = signSessionCookie(cfg, 'u');
  const ok = verifySessionCookie(cfg, signed.value);
  assert.deepEqual(ok, { username: 'u' });

  const [payload, sig] = signed.value.split('.');
  assert.ok(payload && sig);

  const tamperedPayload =
    (payload![0] === 'A' ? 'B' : 'A') + payload!.slice(1) + '.' + sig!;
  assert.equal(verifySessionCookie(cfg, tamperedPayload), null);

  const tamperedSig = payload! + '.' + (sig![0] === 'A' ? 'B' : 'A') + sig!.slice(1);
  assert.equal(verifySessionCookie(cfg, tamperedSig), null);
});

test('verifySessionCookie rejects expired cookies', () => {
  const cfg = createAuthConfig({
    username: 'u',
    password: 'A_strong1!password',
    ttlSeconds: -1,
  });

  const signed = signSessionCookie(cfg, 'u');
  assert.equal(verifySessionCookie(cfg, signed.value), null);
});

test('parseCookies parses and decodes values', () => {
  const parsed = parseCookies('a=b; c=d%20e; empty=; spaced = value');
  assert.equal(parsed.a, 'b');
  assert.equal(parsed.c, 'd e');
  assert.equal(parsed.empty, '');
  assert.equal(parsed.spaced, 'value');
});

test('auth/session smoke (server login -> verify -> logout)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dzzenos-auth-test-'));
  const authFile = path.join(tmpDir, 'auth.json');
  const dbPath = path.join(tmpDir, 'dzzenos-test.db');

  const cfg = createAuthConfig({
    username: 'tester',
    password: 'A_strong1!password',
    ttlSeconds: 60,
  });
  saveAuthConfig(authFile, cfg);

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const serverPath = path.join(repoRoot, 'skills/dzzenos/api/server.ts');
  const migrationsDir = path.join(repoRoot, 'skills/dzzenos/db/migrations');

  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', serverPath, '--port', String(port), '--db', dbPath, '--migrations', migrationsDir],
    {
      env: {
        ...process.env,
        DZZENOS_AUTH_FILE: authFile,
        HOST: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (d) => (stdout += d.toString()));
  child.stderr?.on('data', (d) => (stderr += d.toString()));

  try {
    await waitForServer(`${baseUrl}${AUTH_READY_PATH}`);

    const loginBody = new URLSearchParams({
      [AUTH_USERNAME_FIELD]: 'tester',
      [AUTH_PASSWORD_FIELD]: 'A_strong1!password',
    });
    const loginRes = await fetch(`${baseUrl}${AUTH_LOGIN_PATH}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: baseUrl,
      },
      body: loginBody,
    });
    assert.equal(loginRes.status, 302);
    const setCookie = loginRes.headers.get('set-cookie');
    assert.ok(setCookie, 'missing set-cookie header');
    const cookie = setCookie!.split(';')[0];

    const verifyOk = await fetch(`${baseUrl}${AUTH_VERIFY_PATH}`, {
      headers: { cookie },
    });
    assert.equal(verifyOk.status, 200);

    const logoutRes = await fetch(`${baseUrl}${AUTH_LOGOUT_PATH}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        cookie,
        origin: baseUrl,
      },
    });
    assert.equal(logoutRes.status, 302);

    const logoutSetCookie = logoutRes.headers.get('set-cookie');
    assert.ok(logoutSetCookie, 'missing logout set-cookie header');
    const clearedCookie = logoutSetCookie!.split(';')[0];

    const verifyAfterLogout = await fetch(`${baseUrl}${AUTH_VERIFY_PATH}`, {
      headers: { cookie: clearedCookie },
    });
    assert.equal(verifyAfterLogout.status, 401);
  } catch (err) {
    const detail = `Server stdout:\n${stdout}\nServer stderr:\n${stderr}`;
    throw new Error(`${(err as Error).message}\n${detail}`);
  } finally {
    await stopProcess(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
