#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAuthConfig, saveAuthConfig } from '../skills/dzzenos/api/auth.ts';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') out.file = String(argv[++i]);
    if (a === '--username') out.username = String(argv[++i]);
    if (a === '--password') out.password = String(argv[++i]);
    if (a === '--cookie-name') out.cookieName = String(argv[++i]);
    if (a === '--ttl-seconds') out.ttlSeconds = Number(argv[++i]);
    if (a === '--password-policy') out.passwordPolicy = String(argv[++i]);
  }
  return out;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const args = parseArgs(process.argv.slice(2));
if (!args.file || !args.username || !args.password) {
  console.error('Usage: scripts/init-auth.mjs --file <path> --username <u> --password <p> [--cookie-name dzzenos_session] [--ttl-seconds 604800] [--password-policy strict]');
  process.exit(2);
}

const cfg = createAuthConfig({
  username: args.username,
  password: args.password,
  cookieName: args.cookieName,
  ttlSeconds: Number.isFinite(args.ttlSeconds)
    ? args.ttlSeconds
    : Number.isFinite(Number(process.env.AUTH_TTL_SECONDS))
      ? Number(process.env.AUTH_TTL_SECONDS)
      : undefined,
  passwordPolicy: args.passwordPolicy ?? process.env.AUTH_PASSWORD_POLICY ?? undefined,
});

saveAuthConfig(args.file, cfg);

console.log(JSON.stringify({ ok: true, file: args.file, username: cfg.username, cookieName: cfg.cookie.name }, null, 2));
