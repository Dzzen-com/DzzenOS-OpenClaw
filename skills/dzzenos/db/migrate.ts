#!/usr/bin/env node
/**
 * Minimal SQLite migration runner for DzzenOS (local-first).
 *
 * Runs all *.sql files in skills/dzzenos/db/migrations/ in lexicographic order.
 * Uses Node's built-in `node:sqlite` (Node 22+).
 *
 * Usage:
 *   node --experimental-strip-types skills/dzzenos/db/migrate.ts --db ./data/dzzenos.db
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Options = {
  dbPath: string;
  migrationsDir: string;
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

function main() {
  const args = parseArgs(process.argv.slice(2));

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '../../..');

  const migrationsDir = path.resolve(
    args.migrationsDir ?? path.join(repoRoot, 'skills/dzzenos/db/migrations')
  );
  const dbPath = path.resolve(args.dbPath ?? path.join(repoRoot, 'data/dzzenos.db'));

  ensureDirForFile(dbPath);

  const db = new DatabaseSync(dbPath);
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

  let ran = 0;

  for (const file of files) {
    if (applied.has(file)) continue;

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
}

main();
