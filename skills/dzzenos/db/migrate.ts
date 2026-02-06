#!/usr/bin/env node
/**
 * Minimal SQLite migration runner for DzzenOS (local-first).
 *
 * Runs all *.sql files in skills/dzzenos/db/migrations/ in lexicographic order.
 * Uses Node's built-in `node:sqlite` (Node 22+).
 *
 * Usage:
 *   node --experimental-strip-types skills/dzzenos/db/migrate.ts
 *   node --experimental-strip-types skills/dzzenos/db/migrate.ts --db /absolute/path/dzzenos.db
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLegacyRepoDbPath, resolveDbPath } from './paths.ts';

export type Options = {
  dbPath: string;
  migrationsDir: string;
  legacyDbPath?: string;
};

function parseArgs(argv: string[]): Partial<Options> {
  const out: Partial<Options> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db') out.dbPath = argv[++i];
    if (a === '--migrations') out.migrationsDir = argv[++i];
  }
  return out;
}

function ensureDirForFile(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function tryRenameOrCopy(src: string, dst: string) {
  ensureDirForFile(dst);
  try {
    fs.renameSync(src, dst);
  } catch (err: any) {
    if (err?.code !== 'EXDEV') throw err;
    fs.copyFileSync(src, dst);
    fs.unlinkSync(src);
  }
}

function moveLegacyDbIfNeeded(dbPath: string, legacyDbPath?: string) {
  if (!legacyDbPath) return;
  const legacy = path.resolve(legacyDbPath);
  if (legacy === dbPath) return;
  if (fs.existsSync(dbPath)) return;
  if (!fs.existsSync(legacy)) return;

  tryRenameOrCopy(legacy, dbPath);
  for (const suffix of ['-wal', '-shm']) {
    const legacyAux = `${legacy}${suffix}`;
    if (!fs.existsSync(legacyAux)) continue;
    const targetAux = `${dbPath}${suffix}`;
    tryRenameOrCopy(legacyAux, targetAux);
  }

  console.log(`[migrate] moved legacy db from ${legacy} to ${dbPath}`);
}

function escapeSqliteString(v: string): string {
  return v.replace(/'/g, "''");
}

function createPreMigrationBackup(db: DatabaseSync, dbPath: string): string {
  const backupDir = path.resolve(
    process.env.DZZENOS_DB_BACKUP_DIR?.trim() || path.join(path.dirname(dbPath), 'backups')
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${path.basename(dbPath)}.pre-migrate.${stamp}.sqlite`);

  fs.mkdirSync(backupDir, { recursive: true });
  db.exec('PRAGMA wal_checkpoint(FULL);');
  db.exec(`VACUUM INTO '${escapeSqliteString(backupPath)}';`);

  const keepRaw = Number(process.env.DZZENOS_DB_BACKUP_KEEP ?? '');
  const keep = Number.isFinite(keepRaw) && keepRaw >= 1 ? Math.floor(keepRaw) : 10;

  const entries = fs
    .readdirSync(backupDir)
    .filter(
      (f) =>
        f.startsWith(`${path.basename(dbPath)}.pre-migrate.`) &&
        f.endsWith('.sqlite')
    )
    .map((f) => {
      const full = path.join(backupDir, f);
      const st = fs.statSync(full);
      return { full, mtimeMs: st.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const old of entries.slice(keep)) {
    fs.unlinkSync(old.full);
  }

  console.log(`[migrate] backup created ${backupPath}`);
  return backupPath;
}

function restoreFromBackup(backupPath: string, dbPath: string) {
  const tmpPath = `${dbPath}.restore-tmp`;
  ensureDirForFile(dbPath);

  try {
    fs.copyFileSync(backupPath, tmpPath);
    fs.renameSync(tmpPath, dbPath);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }

  for (const suffix of ['-wal', '-shm']) {
    const aux = `${dbPath}${suffix}`;
    if (fs.existsSync(aux)) fs.unlinkSync(aux);
  }

  console.error(`[migrate] restored db from backup ${backupPath}`);
}

function assertDbIntegrity(db: DatabaseSync) {
  const rows = db.prepare('PRAGMA integrity_check;').all() as any[];
  const issues = rows
    .map((row) => String(Object.values(row ?? {})[0] ?? '').trim())
    .filter((v) => v && v.toLowerCase() !== 'ok');
  if (issues.length > 0) {
    throw new Error(`SQLite integrity_check failed: ${issues.join('; ')}`);
  }
}

export function migrate(opts: Options) {
  const migrationsDir = path.resolve(opts.migrationsDir);
  const dbPath = path.resolve(opts.dbPath);
  const legacyDbPath = opts.legacyDbPath ? path.resolve(opts.legacyDbPath) : undefined;

  moveLegacyDbIfNeeded(dbPath, legacyDbPath);
  ensureDirForFile(dbPath);
  const hadDbBeforeOpen = fs.existsSync(dbPath);

  const db = new DatabaseSync(dbPath);
  let closed = false;
  let currentBackupPath: string | null = null;
  const closeDb = () => {
    if (closed) return;
    closed = true;
    db.close();
  };

  try {
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA journal_mode = WAL;');

    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `);

    const applied = new Set<string>();
    for (const row of db.prepare('SELECT name FROM schema_migrations ORDER BY name').all() as any[]) {
      applied.add(row.name);
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    const pending = files.filter((file) => !applied.has(file));
    if (hadDbBeforeOpen) assertDbIntegrity(db);
    currentBackupPath = pending.length > 0 && hadDbBeforeOpen ? createPreMigrationBackup(db, dbPath) : null;
    let ran = 0;

    for (const file of pending) {
      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8');

      db.exec('BEGIN');
      try {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations(name) VALUES (?)').run(file);
        db.exec('COMMIT');
        ran++;
        console.log(`[migrate] applied ${file}`);
      } catch (err) {
        db.exec('ROLLBACK');
        console.error(`[migrate] failed ${file}`);
        throw err;
      }
    }

    console.log(`[migrate] done (db=${dbPath}, ran=${ran}, total=${files.length})`);
  } catch (err) {
    if (!closed) closeDb();
    if (currentBackupPath) {
      try {
        restoreFromBackup(currentBackupPath, dbPath);
      } catch (restoreErr) {
        throw new AggregateError([err as Error, restoreErr as Error], 'Migration failed and restore failed');
      }
    }
    throw err;
  } finally {
    if (!closed) closeDb();
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '../../..');

  const migrationsDir = path.resolve(
    args.migrationsDir ?? path.join(repoRoot, 'skills/dzzenos/db/migrations')
  );
  const resolved = resolveDbPath(args.dbPath);

  migrate({
    dbPath: resolved.dbPath,
    migrationsDir,
    legacyDbPath: resolved.source === 'default' ? getLegacyRepoDbPath(repoRoot) : undefined,
  });
}

function isExecutedDirectly() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isExecutedDirectly()) {
  main();
}
