import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

function fromPackageJson(path: string): string | null {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    const v = String(parsed.version ?? '').trim();
    return v || null;
  } catch {
    return null;
  }
}

function fromGitTag(): string | null {
  try {
    const out = execSync('git describe --tags --always', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (!out) return null;
    return out.replace(/^v/i, '');
  } catch {
    return null;
  }
}

function resolveAppVersion(): string {
  const envVersion =
    process.env.VITE_APP_VERSION?.trim() ||
    process.env.VITE_DZZENOS_VERSION?.trim() ||
    process.env.VITE_PACKAGE_VERSION?.trim();
  if (envVersion) return envVersion.replace(/^v/i, '');

  const rootPackageVersion = fromPackageJson(resolve(repoRoot, 'package.json'));
  if (rootPackageVersion) return rootPackageVersion.replace(/^v/i, '');

  const gitTag = fromGitTag();
  if (gitTag) return gitTag;

  const uiPackageVersion = fromPackageJson(resolve(here, 'package.json'));
  if (uiPackageVersion) return uiPackageVersion.replace(/^v/i, '');

  return '0.0.0';
}

const appVersion = resolveAppVersion();

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
