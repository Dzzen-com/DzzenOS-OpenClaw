import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAuthConfig,
  parseCookies,
  signSessionCookie,
  verifyPassword,
  verifySessionCookie,
} from '../../skills/dzzenos/api/auth.ts';

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
