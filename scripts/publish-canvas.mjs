#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'apps', 'ui', 'dist');

const targetRoot = process.env.OPENCLAW_CANVAS_DIR
  ?? process.env.OPENCLAW_STATE_DIR && path.join(process.env.OPENCLAW_STATE_DIR, 'canvas')
  ?? '/root/.openclaw/canvas';

const targetDir = path.join(targetRoot, 'dzzenos');

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const apiBase = process.env.DZZENOS_API_BASE ?? process.env.VITE_API_BASE ?? 'http://127.0.0.1:8787';
const openclawPath = process.env.VITE_OPENCLAW_PATH ?? '';

console.log('[canvas] building UI...');
const env = `VITE_API_BASE=${JSON.stringify(apiBase)}${openclawPath ? ` VITE_OPENCLAW_PATH=${JSON.stringify(openclawPath)}` : ''}`;
execSync(`${env} corepack pnpm -C apps/ui build`, { stdio: 'inherit' });

if (!fs.existsSync(distDir)) {
  throw new Error(`UI dist not found at ${distDir}. Build failed?`);
}

console.log(`[canvas] publishing to ${targetDir}`);
rmrf(targetDir);
copyDir(distDir, targetDir);

console.log('[canvas] done. Open via Gateway:');
console.log('  /__openclaw__/canvas/dzzenos/');
