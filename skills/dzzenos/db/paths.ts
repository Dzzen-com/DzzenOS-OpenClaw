import os from 'node:os';
import path from 'node:path';

export type DbPathSource = 'arg' | 'env' | 'default';

export function getDefaultDataDir(): string {
  const overrideDir = process.env.DZZENOS_DATA_DIR?.trim();
  if (overrideDir) return path.resolve(overrideDir);

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'DzzenOS-OpenClaw');
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA?.trim();
    if (appData) return path.join(appData, 'DzzenOS-OpenClaw');
    return path.join(os.homedir(), 'AppData', 'Roaming', 'DzzenOS-OpenClaw');
  }

  const xdgDataHome = process.env.XDG_DATA_HOME?.trim();
  if (xdgDataHome) return path.join(xdgDataHome, 'dzzenos-openclaw');
  return path.join(os.homedir(), '.local', 'share', 'dzzenos-openclaw');
}

export function getDefaultDbPath(): string {
  return path.join(getDefaultDataDir(), 'dzzenos.db');
}

export function getDefaultWorkspaceDir(): string {
  return path.join(getDefaultDataDir(), 'workspace');
}

export function getLegacyRepoDbPath(repoRoot: string): string {
  return path.resolve(repoRoot, 'data', 'dzzenos.db');
}

export function getLegacyRepoWorkspaceDir(repoRoot: string): string {
  return path.resolve(repoRoot, 'data', 'workspace');
}

export function resolveDbPath(dbPathArg?: string): { dbPath: string; source: DbPathSource } {
  const argPath = dbPathArg?.trim();
  if (argPath) return { dbPath: path.resolve(argPath), source: 'arg' };

  const envPath = process.env.DZZENOS_DB_PATH?.trim();
  if (envPath) return { dbPath: path.resolve(envPath), source: 'env' };

  return { dbPath: getDefaultDbPath(), source: 'default' };
}
