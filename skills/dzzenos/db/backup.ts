#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLegacyRepoDbPath, resolveDbPath } from './paths.ts';

type Command = 'create' | 'list' | 'restore';

type Args = {
  cmd: Command;
  dbPathArg?: string;
  backupDirArg?: string;
  backupFileArg?: string;
  nameArg?: string;
  json: boolean;
};

function parseBusyTimeoutMs(raw: string | undefined): number {
  const n = Number(raw ?? '');
  if (!Number.isFinite(n) || n < 0) return 5000;
  return Math.floor(n);
}

function parseArgs(argv: string[]): Args {
  const cmdRaw = String(argv[0] ?? '').trim();
  if (cmdRaw !== 'create' && cmdRaw !== 'list' && cmdRaw !== 'restore') {
    throw new Error('Usage: backup.ts <create|list|restore> [--db PATH] [--backup-dir DIR] [--file FILE] [--name NAME] [--json]');
  }
  const args: Args = { cmd: cmdRaw, json: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db') args.dbPathArg = argv[++i];
    else if (a === '--backup-dir') args.backupDirArg = argv[++i];
    else if (a === '--file') args.backupFileArg = argv[++i];
    else if (a === '--name') args.nameArg = argv[++i];
    else if (a === '--json') args.json = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function repoRootFromModule(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '../../..');
}

function resolveDbPathForOps(dbPathArg?: string): string {
  const repoRoot = repoRootFromModule();
  const resolved = resolveDbPath(dbPathArg);
  if (resolved.source !== 'default') return resolved.dbPath;
  if (fs.existsSync(resolved.dbPath)) return resolved.dbPath;
  const legacy = getLegacyRepoDbPath(repoRoot);
  if (fs.existsSync(legacy)) return legacy;
  return resolved.dbPath;
}

function ensureDirForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function escapeSqliteString(v: string): string {
  return v.replace(/'/g, "''");
}

function defaultBackupDirForDb(dbPath: string): string {
  return path.resolve(
    process.env.DZZENOS_DB_BACKUP_DIR?.trim() || path.join(path.dirname(dbPath), 'backups')
  );
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function assertDbIntegrity(dbPath: string) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`PRAGMA busy_timeout = ${parseBusyTimeoutMs(process.env.DZZENOS_SQLITE_BUSY_TIMEOUT_MS)};`);
    const rows = db.prepare('PRAGMA integrity_check;').all() as any[];
    const issues = rows
      .map((row) => String(Object.values(row ?? {})[0] ?? '').trim())
      .filter((v) => v && v.toLowerCase() !== 'ok');
    if (issues.length > 0) {
      throw new Error(`SQLite integrity_check failed: ${issues.join('; ')}`);
    }
  } finally {
    db.close();
  }
}

function createBackup(dbPath: string, backupDir: string, nameArg?: string): string {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`DB file does not exist: ${dbPath}`);
  }
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`PRAGMA busy_timeout = ${parseBusyTimeoutMs(process.env.DZZENOS_SQLITE_BUSY_TIMEOUT_MS)};`);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = normalizeName(nameArg ?? 'manual') || 'manual';
    const backupPath = path.join(
      backupDir,
      `${path.basename(dbPath)}.${name}.${stamp}.sqlite`
    );
    fs.mkdirSync(backupDir, { recursive: true });
    db.exec('PRAGMA wal_checkpoint(FULL);');
    db.exec(`VACUUM INTO '${escapeSqliteString(backupPath)}';`);
    return backupPath;
  } finally {
    db.close();
  }
}

function listBackups(dbPath: string, backupDir: string): Array<{ path: string; sizeBytes: number; mtimeIso: string }> {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith(`${path.basename(dbPath)}.`) && f.endsWith('.sqlite'))
    .map((f) => {
      const full = path.join(backupDir, f);
      const st = fs.statSync(full);
      return { path: full, sizeBytes: st.size, mtimeIso: st.mtime.toISOString(), mtimeMs: st.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map(({ path: p, sizeBytes, mtimeIso }) => ({ path: p, sizeBytes, mtimeIso }));
}

function resolveBackupFile(fileArg: string, backupDir: string): string {
  const candidate = path.resolve(fileArg);
  if (fs.existsSync(candidate)) return candidate;
  const inDir = path.resolve(backupDir, fileArg);
  if (fs.existsSync(inDir)) return inDir;
  throw new Error(`Backup file not found: ${fileArg}`);
}

function restoreBackup(dbPath: string, backupFilePath: string) {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file does not exist: ${backupFilePath}`);
  }
  ensureDirForFile(dbPath);
  const tmpPath = `${dbPath}.restore-tmp`;
  try {
    fs.copyFileSync(backupFilePath, tmpPath);
    fs.renameSync(tmpPath, dbPath);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
  for (const suffix of ['-wal', '-shm']) {
    const aux = `${dbPath}${suffix}`;
    if (fs.existsSync(aux)) fs.unlinkSync(aux);
  }
  assertDbIntegrity(dbPath);
}

function printTable(rows: Array<{ path: string; sizeBytes: number; mtimeIso: string }>) {
  if (rows.length === 0) {
    console.log('No backups found.');
    return;
  }
  for (const row of rows) {
    console.log(`${row.mtimeIso}\t${row.sizeBytes}\t${row.path}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = resolveDbPathForOps(args.dbPathArg);
  const backupDir = path.resolve(args.backupDirArg ?? defaultBackupDirForDb(dbPath));

  if (args.cmd === 'create') {
    const backupPath = createBackup(dbPath, backupDir, args.nameArg);
    if (args.json) {
      console.log(JSON.stringify({ ok: true, cmd: 'create', dbPath, backupDir, backupPath }, null, 2));
      return;
    }
    console.log(`[backup] created ${backupPath}`);
    return;
  }

  if (args.cmd === 'list') {
    const rows = listBackups(dbPath, backupDir);
    if (args.json) {
      console.log(JSON.stringify({ ok: true, cmd: 'list', dbPath, backupDir, backups: rows }, null, 2));
      return;
    }
    printTable(rows);
    return;
  }

  if (!args.backupFileArg) {
    throw new Error('restore requires --file <backup.sqlite>');
  }
  const backupFilePath = resolveBackupFile(args.backupFileArg, backupDir);
  restoreBackup(dbPath, backupFilePath);
  if (args.json) {
    console.log(JSON.stringify({ ok: true, cmd: 'restore', dbPath, backupFilePath }, null, 2));
    return;
  }
  console.log(`[backup] restored ${dbPath} from ${backupFilePath}`);
}

function isExecutedDirectly() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isExecutedDirectly()) {
  main();
}
