#!/usr/bin/env node
/**
 * DzzenOS minimal local HTTP API (SQLite, local-first).
 *
 * Endpoints:
 *   GET   /boards
 *   GET   /tasks?boardId=
 *   POST  /tasks                   { title, description?, boardId? }
 *   PATCH /tasks/:id               { status?, title?, description? }
 *   POST  /tasks/:id/simulate-run  (create run + steps; auto-advance)
 *   GET   /tasks/:id/runs          (runs + steps)
 *
 * Usage:
 *   node --experimental-strip-types skills/dzzenos/api/server.ts
 *   node --experimental-strip-types skills/dzzenos/api/server.ts --port 8787 --db ./data/dzzenos.db
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

import { migrate } from '../db/migrate.ts';

type Options = {
  port: number;
  host: string;
  dbPath: string;
  migrationsDir: string;
};

function parseArgs(argv: string[]): Partial<Options> {
  const out: Partial<Options> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') out.port = Number(argv[++i]);
    if (a === '--host') out.host = String(argv[++i]);
    if (a === '--db') out.dbPath = String(argv[++i]);
    if (a === '--migrations') out.migrationsDir = String(argv[++i]);
  }
  return out;
}

function isAllowedOrigin(origin: string): boolean {
  // Allow local UI dev servers.
  // Example: http://localhost:5173, http://127.0.0.1:3000
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

function sendJson(res: http.ServerResponse, status: number, body: any, headers?: Record<string, string>) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data).toString(),
    ...(headers ?? {}),
  });
  res.end(data);
}

function sendText(res: http.ServerResponse, status: number, text: string, headers?: Record<string, string>) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    ...(headers ?? {}),
  });
  res.end(text);
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function rowOrNull<T>(rows: T[]): T | null {
  return rows.length ? rows[0] : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function seedIfEmpty(db: DatabaseSync) {
  const row = rowOrNull<{ c: number }>(
    db.prepare('SELECT COUNT(*) as c FROM workspaces').all() as any
  );
  const count = row?.c ?? 0;
  if (count > 0) return;

  const workspaceId = randomUUID();
  const boardId = randomUUID();

  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO workspaces(id, name, description) VALUES (?, ?, ?)').run(
      workspaceId,
      'Default Workspace',
      'Seeded on first run'
    );
    db.prepare(
      'INSERT INTO boards(id, workspace_id, name, description, position) VALUES (?, ?, ?, ?, 0)'
    ).run(boardId, workspaceId, 'Default Board', 'Seeded on first run');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function getDefaultBoardId(db: DatabaseSync): string | null {
  const row = rowOrNull<{ id: string }>(
    db.prepare('SELECT id FROM boards ORDER BY position ASC, created_at ASC LIMIT 1').all() as any
  );
  return row?.id ?? null;
}

function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '../../..');

  const args = parseArgs(process.argv.slice(2));

  const migrationsDir = path.resolve(
    args.migrationsDir ?? path.join(repoRoot, 'skills/dzzenos/db/migrations')
  );
  const dbPath = path.resolve(args.dbPath ?? path.join(repoRoot, 'data/dzzenos.db'));

  const port = Number(args.port ?? process.env.PORT ?? 8787);
  const host = String(args.host ?? process.env.HOST ?? '127.0.0.1');

  migrate({ dbPath, migrationsDir });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  seedIfEmpty(db);

  const server = http.createServer(async (req, res) => {
    const origin = (req.headers.origin as string | undefined) ?? '';
    const corsHeaders: Record<string, string> = {
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (origin && isAllowedOrigin(origin)) {
      corsHeaders['access-control-allow-origin'] = origin;
      corsHeaders['vary'] = 'Origin';
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    try {
      if (req.method === 'GET' && url.pathname === '/boards') {
        const boards = db
          .prepare(
            'SELECT id, workspace_id, name, description, position, created_at, updated_at FROM boards ORDER BY position ASC, created_at ASC'
          )
          .all();
        return sendJson(res, 200, boards, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/tasks') {
        let boardId = url.searchParams.get('boardId');
        if (!boardId) boardId = getDefaultBoardId(db);
        if (!boardId) return sendJson(res, 400, { error: 'Missing boardId (and no default board exists)' }, corsHeaders);

        const tasks = db
          .prepare(
            'SELECT id, board_id, title, description, status, position, due_at, created_at, updated_at FROM tasks WHERE board_id = ? ORDER BY position ASC, created_at ASC'
          )
          .all(boardId);
        return sendJson(res, 200, tasks, corsHeaders);
      }

      if (req.method === 'POST' && url.pathname === '/tasks') {
        const body = await readJson(req);
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        const description = typeof body?.description === 'string' ? body.description : null;
        let boardId = typeof body?.boardId === 'string' ? body.boardId : null;
        if (!boardId) boardId = getDefaultBoardId(db);
        if (!boardId) return sendJson(res, 400, { error: 'Missing boardId (and no default board exists)' }, corsHeaders);

        if (!title) return sendJson(res, 400, { error: 'title is required' }, corsHeaders);

        const id = randomUUID();
        db.prepare('INSERT INTO tasks(id, board_id, title, description) VALUES (?, ?, ?, ?)').run(
          id,
          boardId,
          title,
          description
        );

        const task = rowOrNull<any>(
          db.prepare(
            'SELECT id, board_id, title, description, status, position, due_at, created_at, updated_at FROM tasks WHERE id = ?'
          ).all(id) as any
        );
        return sendJson(res, 201, task, corsHeaders);
      }

      const simulateMatch = req.method === 'POST' ? url.pathname.match(/^\/tasks\/([^/]+)\/simulate-run$/) : null;
      if (simulateMatch) {
        const taskId = simulateMatch[1];

        const taskRow = rowOrNull<{ id: string; board_id: string; workspace_id: string }>(
          db.prepare(
            `SELECT t.id as id, t.board_id as board_id, b.workspace_id as workspace_id
             FROM tasks t
             JOIN boards b ON b.id = t.board_id
             WHERE t.id = ?`
          ).all(taskId) as any
        );
        if (!taskRow) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);

        const runId = randomUUID();
        const stepIds = [randomUUID(), randomUUID(), randomUUID()];

        db.exec('BEGIN');
        try {
          db.prepare(
            'INSERT INTO agent_runs(id, workspace_id, board_id, task_id, agent_name, status) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(runId, taskRow.workspace_id, taskRow.board_id, taskRow.id, 'simulator', 'running');

          const ins = db.prepare(
            'INSERT INTO run_steps(id, run_id, step_index, kind, status, input_json, output_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
          );

          ins.run(stepIds[0], runId, 0, 'plan', 'running', JSON.stringify({ prompt: 'Plan' }), null);
          ins.run(stepIds[1], runId, 1, 'act', 'running', JSON.stringify({ prompt: 'Act' }), null);
          ins.run(stepIds[2], runId, 2, 'report', 'running', JSON.stringify({ prompt: 'Report' }), null);

          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }

        // Best-effort in-process advancement (dev-only simulation).
        (async () => {
          try {
            for (const stepId of stepIds) {
              await sleep(250);
              db.prepare(
                "UPDATE run_steps SET status = 'succeeded', finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?"
              ).run(stepId);
            }
            await sleep(100);
            db.prepare(
              "UPDATE agent_runs SET status = 'succeeded', finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?"
            ).run(runId);
          } catch (e) {
            console.error('[dzzenos-api] simulate-run advance failed', e);
          }
        })();

        return sendJson(res, 201, { runId }, corsHeaders);
      }

      const runsMatch = req.method === 'GET' ? url.pathname.match(/^\/tasks\/([^/]+)\/runs$/) : null;
      if (runsMatch) {
        const taskId = runsMatch[1];
        const stuckMinutes = Number(url.searchParams.get('stuckMinutes') ?? 5);

        const runs = db
          .prepare(
            `SELECT id, workspace_id, board_id, task_id, agent_name, status, started_at, finished_at, created_at, updated_at,
                    CASE
                      WHEN status = 'running' AND julianday(created_at) < julianday('now') - (? / 1440.0) THEN 1
                      ELSE 0
                    END as is_stuck
             FROM agent_runs
             WHERE task_id = ?
             ORDER BY created_at DESC`
          )
          .all(stuckMinutes, taskId) as any[];

        const runIds = runs.map((r) => r.id);
        const stepsByRun = new Map<string, any[]>();
        if (runIds.length) {
          const placeholders = runIds.map(() => '?').join(',');
          const steps = db
            .prepare(
              `SELECT id, run_id, step_index, kind, status, input_json, output_json, started_at, finished_at, created_at, updated_at
               FROM run_steps
               WHERE run_id IN (${placeholders})
               ORDER BY run_id, step_index ASC`
            )
            .all(...runIds) as any[];

          for (const s of steps) {
            const list = stepsByRun.get(s.run_id) ?? [];
            list.push(s);
            stepsByRun.set(s.run_id, list);
          }
        }

        const payload = runs.map((r) => ({
          ...r,
          is_stuck: Boolean(r.is_stuck),
          steps: stepsByRun.get(r.id) ?? [],
        }));

        return sendJson(res, 200, payload, corsHeaders);
      }

      const patchMatch = req.method === 'PATCH' ? url.pathname.match(/^\/tasks\/([^/]+)$/) : null;
      if (patchMatch) {
        const id = patchMatch[1];
        const body = await readJson(req);

        const allowedStatus = new Set(['todo', 'doing', 'done', 'blocked']);
        const updates: string[] = [];
        const params: any[] = [];

        if (body?.title !== undefined) {
          const title = typeof body.title === 'string' ? body.title.trim() : '';
          if (!title) return sendJson(res, 400, { error: 'title must be a non-empty string' }, corsHeaders);
          updates.push('title = ?');
          params.push(title);
        }

        if (body?.description !== undefined) {
          const description = body.description === null ? null : typeof body.description === 'string' ? body.description : undefined;
          if (description === undefined) return sendJson(res, 400, { error: 'description must be a string or null' }, corsHeaders);
          updates.push('description = ?');
          params.push(description);
        }

        if (body?.status !== undefined) {
          const status = typeof body.status === 'string' ? body.status : '';
          if (!allowedStatus.has(status)) {
            return sendJson(res, 400, { error: "status must be one of: todo, doing, done, blocked" }, corsHeaders);
          }
          updates.push('status = ?');
          params.push(status);
        }

        if (updates.length === 0) {
          return sendJson(res, 400, { error: 'No valid fields to update (status/title/description)' }, corsHeaders);
        }

        params.push(id);
        const info = db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);

        const task = rowOrNull<any>(
          db.prepare(
            'SELECT id, board_id, title, description, status, position, due_at, created_at, updated_at FROM tasks WHERE id = ?'
          ).all(id) as any
        );
        return sendJson(res, 200, task, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/') {
        return sendText(res, 200, 'DzzenOS API: try GET /boards', corsHeaders);
      }

      return sendJson(res, 404, { error: 'Not found' }, corsHeaders);
    } catch (err: any) {
      console.error('[dzzenos-api] error', err);
      return sendJson(res, 500, { error: 'Internal server error' }, corsHeaders);
    }
  });

  server.listen(port, host, () => {
    console.log(`[dzzenos-api] listening on http://${host}:${port}`);
    console.log(`[dzzenos-api] db=${dbPath}`);
  });
}

main();
