#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const migrateScript = path.join(repoRoot, 'skills/dzzenos/db/migrate.ts');
const sourceMigrations = path.join(repoRoot, 'skills/dzzenos/db/migrations');

function runMigrate({ dbPath, migrationsDir, expectExit = 0 }) {
  const args = ['--experimental-strip-types', migrateScript, '--db', dbPath, '--migrations', migrationsDir];
  const res = spawnSync('node', args, { encoding: 'utf8' });
  if (res.status !== expectExit) {
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    throw new Error(`migrate exit=${res.status}, expected=${expectExit}\n${out}`);
  }
  return `${res.stdout ?? ''}${res.stderr ?? ''}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dzzenos-migrate-test-'));
  try {
    // Full migration path should pass.
    const dbPath = path.join(tmpRoot, 'full.db');
    runMigrate({ dbPath, migrationsDir: sourceMigrations, expectExit: 0 });
    const second = runMigrate({ dbPath, migrationsDir: sourceMigrations, expectExit: 0 });
    assert(second.includes('ran=0'), 'second migration run should be idempotent (ran=0)');

    // Broken migration should restore from backup.
    const restoreDbPath = path.join(tmpRoot, 'restore.db');
    const restoreMigrations = path.join(tmpRoot, 'restore-migrations');
    fs.mkdirSync(restoreMigrations, { recursive: true });
    fs.copyFileSync(path.join(sourceMigrations, '0001_init.sql'), path.join(restoreMigrations, '0001_init.sql'));
    runMigrate({ dbPath: restoreDbPath, migrationsDir: restoreMigrations, expectExit: 0 });

    fs.writeFileSync(
      path.join(restoreMigrations, '0002_broken.sql'),
      'CREATE TABLE restore_test_table(id TEXT PRIMARY KEY);\nTHIS IS INVALID SQL;\n',
      'utf8'
    );

    const failed = runMigrate({ dbPath: restoreDbPath, migrationsDir: restoreMigrations, expectExit: 1 });
    assert(failed.includes('restored db from backup'), 'failed migration should restore DB from backup');

    const db = new DatabaseSync(restoreDbPath);
    try {
      const migrations = db.prepare('SELECT name FROM schema_migrations ORDER BY name').all();
      assert(migrations.length === 1 && migrations[0]?.name === '0001_init.sql', 'schema_migrations should remain at 0001 after restore');
      const maybeTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'restore_test_table'")
        .all();
      assert(maybeTable.length === 0, 'broken migration table should not exist after restore');
    } finally {
      db.close();
    }

    console.log('[test-migrations] ok');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main();
