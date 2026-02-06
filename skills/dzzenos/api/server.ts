#!/usr/bin/env node
/**
 * DzzenOS minimal local HTTP API (SQLite, local-first).
 *
 * Endpoints:
 *   GET   /boards
 *   GET   /tasks?boardId=
 *   GET   /runs?status=running|failed|...&stuckMinutes=
 *   GET   /approvals?status=pending|approved|rejected
 *   POST  /approvals/:id/approve   { decidedBy?, reason? }
 *   POST  /approvals/:id/reject    { decidedBy?, reason? }
 *   POST  /tasks/:id/request-approval (stub) { title?, body?, stepId? }
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
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

type SseClient = {
  id: string;
  res: http.ServerResponse;
};

import { migrate } from '../db/migrate.ts';
import {
  defaultAuthFile,
  loadAuthConfig,
  parseCookies,
  signSessionCookie,
  verifyPassword,
  verifySessionCookie,
} from './auth.ts';
import { MARKETPLACE_AGENTS, getMarketplaceAgentPreset, type PromptOverrides } from './marketplace/agents.ts';
import {
  MARKETPLACE_SKILLS,
  getMarketplaceSkillPreset,
  type SkillCapabilities,
} from './marketplace/skills.ts';

type Options = {
  port: number;
  host: string;
  dbPath: string;
  migrationsDir: string;
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

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

type AllowedOrigins = {
  origins: Set<string>;
  hosts: Set<string>;
  hostPorts: Set<string>;
};

function parseAllowedOrigins(raw: string | undefined): AllowedOrigins {
  const origins = new Set<string>();
  const hosts = new Set<string>();
  const hostPorts = new Set<string>();
  if (!raw) return { origins, hosts, hostPorts };

  for (const part of raw.split(',').map((p) => p.trim()).filter(Boolean)) {
    if (part.includes('://')) {
      try {
        const u = new URL(part);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          origins.add(u.origin);
        }
      } catch {
        // ignore invalid
      }
    } else if (part.includes(':')) {
      hostPorts.add(part.toLowerCase());
    } else {
      hosts.add(part.toLowerCase());
    }
  }

  return { origins, hosts, hostPorts };
}

function isAllowedOrigin(origin: string, reqHost: string | undefined, allowed: AllowedOrigins): boolean {
  // Allow local UI dev servers, same-host deployments, and configured allowlist.
  // Example env: DZZENOS_ALLOWED_ORIGINS="https://dzzenos.example.com,localhost:5173"
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const hostname = u.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) return true;
    if (allowed.origins.has(u.origin)) return true;
    if (allowed.hosts.has(hostname)) return true;
    if (allowed.hostPorts.has(u.host.toLowerCase())) return true;
    if (reqHost && u.host.toLowerCase() === String(reqHost).toLowerCase()) return true;
    return false;
  } catch {
    return false;
  }
}

function sendJson(res: http.ServerResponse, status: number, body: any, headers?: Record<string, string>) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data).toString(),
    'cache-control': 'no-store',
    ...(headers ?? {}),
  });
  res.end(data);
}

function sendText(res: http.ServerResponse, status: number, text: string, headers?: Record<string, string>) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...(headers ?? {}),
  });
  res.end(text);
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function rowOrNull<T>(rows: T[]): T | null {
  return rows.length ? rows[0] : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const TASK_STATUSES = new Set(['ideas', 'todo', 'doing', 'review', 'release', 'done', 'archived']);
const CHECKLIST_STATES = new Set(['todo', 'doing', 'done']);

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err: any) {
    if (err?.code === 'ENOENT') return '';
    throw err;
  }
}

function writeTextFile(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function appendTextFile(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, content, 'utf8');
}

function extractOutputText(data: any): string {
  if (typeof data?.output === 'string') return data.output;
  if (typeof data?.output_text === 'string') return data.output_text;

  const output = Array.isArray(data?.output) ? data.output : [];
  const texts: string[] = [];
  for (const it of output) {
    const content = it?.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (c?.type === 'output_text' && typeof c?.text === 'string') texts.push(c.text);
        if (c?.type === 'text' && typeof c?.text === 'string') texts.push(c.text);
      }
    }
  }
  return texts.join('');
}

function tryParseJson(text: string): any | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to extract first JSON object block
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isRequestSecure(req: http.IncomingMessage): boolean {
  if ((req.socket as any).encrypted) return true;
  const xf = String(req.headers['x-forwarded-proto'] ?? '');
  return xf.split(',')[0]?.trim().toLowerCase() === 'https';
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

const DEFAULT_OPENCLAW_AGENT_ID = 'main';
const PROMPT_OVERRIDE_KEYS = new Set(['system', 'plan', 'execute', 'chat', 'report']);

function normalizeString(value: any): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseStringArrayJson(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean);
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parsePromptOverridesJson(raw: any): PromptOverrides {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: PromptOverrides = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!PROMPT_OVERRIDE_KEYS.has(k)) continue;
      if (typeof v === 'string' && v.trim()) (out as any)[k] = v;
    }
    return out;
  }

  if (typeof raw !== 'string') return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsePromptOverridesJson(parsed);
  } catch {
    return {};
  }
}

function jsonStringifyArray(values: string[]): string {
  return JSON.stringify(values.map((v) => String(v)).filter((v) => v.trim().length > 0));
}

function jsonStringifyPromptOverrides(value: PromptOverrides): string {
  const out: Record<string, string> = {};
  for (const k of PROMPT_OVERRIDE_KEYS) {
    const v = (value as any)[k];
    if (typeof v === 'string' && v.trim()) out[k] = v;
  }
  return JSON.stringify(out);
}

function parseCapabilitiesJson(raw: any): SkillCapabilities {
  const normalize = (v: any) => (typeof v === 'string' ? v.trim() : '');

  const fromObject = (obj: any): SkillCapabilities => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const secrets = Array.isArray(obj.secrets) ? obj.secrets.map((s: any) => normalize(s)).filter(Boolean) : [];
    return {
      network: obj.network === true ? true : undefined,
      filesystem: obj.filesystem === true ? true : undefined,
      external_write: obj.external_write === true ? true : undefined,
      secrets: secrets.length ? secrets : undefined,
    };
  };

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return fromObject(raw);
  if (typeof raw !== 'string') return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return fromObject(JSON.parse(trimmed));
  } catch {
    return {};
  }
}

function jsonStringifyCapabilities(value: SkillCapabilities): string {
  const normalize = (v: any) => (typeof v === 'string' ? v.trim() : '');
  const out: any = {};
  if (value.network) out.network = true;
  if (value.filesystem) out.filesystem = true;
  if (value.external_write) out.external_write = true;
  const secrets = Array.isArray(value.secrets) ? value.secrets.map((s) => normalize(s)).filter(Boolean) : [];
  if (secrets.length) out.secrets = secrets;
  return JSON.stringify(out);
}

function skillRowToDto(r: any) {
  return {
    slug: String(r.slug),
    display_name: r.display_name ?? null,
    description: r.description ?? null,
    tier: String(r.tier ?? 'community'),
    enabled: Boolean(r.enabled),
    source: String(r.source ?? 'manual'),
    preset_key: r.preset_key ?? null,
    sort_order: Number(r.sort_order ?? 0),
    capabilities: parseCapabilitiesJson(r.capabilities_json),
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
  };
}

function agentRowToDto(r: any) {
  return {
    id: String(r.id),
    display_name: String(r.display_name ?? ''),
    emoji: r.emoji ?? null,
    openclaw_agent_id: String(r.openclaw_agent_id ?? ''),
    enabled: Boolean(r.enabled),
    role: r.role ?? null,
    description: r.description ?? null,
    category: String(r.category ?? 'general'),
    tags: parseStringArrayJson(r.tags_json),
    skills: parseStringArrayJson(r.skills_json),
    prompt_overrides: parsePromptOverridesJson(r.prompt_overrides_json),
    preset_key: r.preset_key ?? null,
    sort_order: Number(r.sort_order ?? 0),
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
    assigned_task_count: Number(r.assigned_task_count ?? 0),
    run_count_7d: Number(r.run_count_7d ?? 0),
    last_used_at: r.last_used_at ?? null,
  };
}

function getDefaultBoardId(db: DatabaseSync): string | null {
  const row = rowOrNull<{ id: string }>(
    db.prepare('SELECT id FROM boards ORDER BY position ASC, created_at ASC LIMIT 1').all() as any
  );
  return row?.id ?? null;
}

function getDefaultWorkspaceId(db: DatabaseSync): string | null {
  const row = rowOrNull<{ id: string }>(
    db.prepare('SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1').all() as any
  );
  return row?.id ?? null;
}

function main() {
  const sseClients = new Map<string, SseClient>();

  function sseBroadcast(event: { type: string; payload?: any }) {
    const data = JSON.stringify({ ts: Date.now(), ...event });
    for (const c of sseClients.values()) {
      try {
        c.res.write(`event: dzzenos\n`);
        c.res.write(`data: ${data}\n\n`);
      } catch {
        // ignore
      }
    }
  }

  function sseHeartbeat() {
    for (const c of sseClients.values()) {
      try {
        c.res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        // ignore
      }
    }
  }

  // Keep SSE connections alive (some proxies close idle connections)
  setInterval(sseHeartbeat, 15_000).unref?.();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '../../..');
  const workspaceDir = path.resolve(
    process.env.DZZENOS_WORKSPACE_DIR ?? path.join(repoRoot, 'data/workspace')
  );

  const docsDir = path.join(workspaceDir, 'docs');
  const memoryDir = path.join(workspaceDir, 'memory');
  const overviewDocPath = path.join(docsDir, 'overview.md');

  const openResponsesUrl =
    process.env.OPENRESPONSES_URL ?? process.env.DZZENOS_OPENRESPONSES_URL ?? '';
  const openResponsesToken =
    process.env.OPENRESPONSES_TOKEN ?? process.env.DZZENOS_OPENRESPONSES_TOKEN ?? '';
  const openResponsesModel =
    process.env.OPENRESPONSES_MODEL ?? process.env.DZZENOS_OPENRESPONSES_MODEL ?? 'openclaw:main';
  const defaultAgentId = process.env.DZZENOS_DEFAULT_AGENT_ID ?? '';

  function boardDocPath(boardId: string) {
    return path.join(docsDir, 'boards', `${boardId}.md`);
  }

  function boardChangelogPath(boardId: string) {
    return path.join(docsDir, 'boards', boardId, 'changelog.md');
  }

  function boardMemoryPath(boardId: string) {
    return path.join(memoryDir, 'boards', `${boardId}.md`);
  }

  async function callOpenResponses(input: {
    sessionKey: string;
    text: string;
    agentOpenClawId?: string | null;
  }): Promise<{ text: string; raw: any }> {
    if (!openResponsesUrl) {
      throw new Error('OpenResponses URL is not configured (set OPENRESPONSES_URL).');
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-openclaw-session-key': input.sessionKey,
    };

    if (input.agentOpenClawId) {
      headers['x-openclaw-agent-id'] = input.agentOpenClawId;
    }
    if (openResponsesToken) {
      headers.authorization = `Bearer ${openResponsesToken}`;
    }

    const res = await fetch(openResponsesUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: openResponsesModel, input: input.text }),
    });

    const rawText = await res.text();
    let raw: any = null;
    try {
      raw = rawText ? JSON.parse(rawText) : null;
    } catch {
      raw = rawText;
    }

    if (!res.ok) {
      throw new Error(
        typeof raw === 'string' ? raw : raw?.error?.message ?? `OpenResponses HTTP ${res.status}`
      );
    }

    const text = typeof raw === 'string' ? raw : extractOutputText(raw);
    return { text, raw };
  }

  async function generateTaskSummary(input: {
    taskTitle: string;
    taskDescription?: string | null;
    sessionKey: string;
    agentOpenClawId?: string | null;
  }): Promise<string> {
    const fallback =
      `Summary for "${input.taskTitle}"\n\n` +
      (input.taskDescription?.trim() ? input.taskDescription.trim() : 'Task completed.');

    if (!openResponsesUrl) return fallback;

    const prompt =
      'Summarize the completed task for changelog and memory. ' +
      'Return 2-5 concise bullet points (Markdown).';

    try {
      const { text } = await callOpenResponses({
        sessionKey: input.sessionKey,
        agentOpenClawId: input.agentOpenClawId ?? null,
        text: `${prompt}\n\nTask title: ${input.taskTitle}\nTask description: ${input.taskDescription ?? ''}`,
      });
      return text?.trim() ? text.trim() : fallback;
    } catch (err) {
      console.warn('[dzzenos-api] summary fallback', err);
      return fallback;
    }
  }

  function appendBoardSummary(params: { boardId: string; title: string; summary: string }) {
    const ts = new Date().toISOString();
    const entryHeader = `## ${params.title}\n\n`;
    const entryBody = `${params.summary}\n\n`;
    const changeEntry = `- ${ts} — ${params.title}\n${params.summary}\n\n`;

    appendTextFile(boardDocPath(params.boardId), entryHeader + entryBody);
    appendTextFile(boardChangelogPath(params.boardId), changeEntry);
    appendTextFile(boardMemoryPath(params.boardId), changeEntry);
  }

  const args = parseArgs(process.argv.slice(2));

  const migrationsDir = path.resolve(
    args.migrationsDir ?? path.join(repoRoot, 'skills/dzzenos/db/migrations')
  );
  const dbPath = path.resolve(args.dbPath ?? path.join(repoRoot, 'data/dzzenos.db'));

  const port = Number(args.port ?? process.env.PORT ?? 8787);
  const host = String(args.host ?? process.env.HOST ?? '127.0.0.1');

  const authFile = String(process.env.DZZENOS_AUTH_FILE ?? defaultAuthFile(repoRoot));
  const auth = loadAuthConfig(authFile);
  const authTtlSeconds = Number(process.env.AUTH_TTL_SECONDS ?? '');
  if (auth && Number.isFinite(authTtlSeconds) && authTtlSeconds > 0) {
    auth.cookie.ttlSeconds = authTtlSeconds;
  }
  const authCookieSameSite = String(process.env.AUTH_COOKIE_SAMESITE ?? 'Strict');
  const allowedOrigins = parseAllowedOrigins(
    process.env.DZZENOS_ALLOWED_ORIGINS ?? process.env.DZZENOS_CORS_ORIGINS
  );

  migrate({ dbPath, migrationsDir });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  seedIfEmpty(db);

  function getTaskMeta(taskId: string) {
    return rowOrNull<{
      id: string;
      board_id: string;
      workspace_id: string;
      title: string;
      description: string | null;
      status: string;
    }>(
      db.prepare(
        `SELECT t.id as id, t.board_id as board_id, b.workspace_id as workspace_id,
                t.title as title, t.description as description, t.status as status
         FROM tasks t
         JOIN boards b ON b.id = t.board_id
         WHERE t.id = ?`
      ).all(taskId) as any
    );
  }

  function getAgentRowById(agentId: string) {
    return rowOrNull<{
      id: string;
      display_name: string;
      openclaw_agent_id: string;
    }>(
      db
        .prepare(
          'SELECT id, display_name, openclaw_agent_id FROM agents WHERE id = ? AND enabled = 1'
        )
        .all(agentId) as any
    );
  }

  function getDefaultAgentRow() {
    if (defaultAgentId) {
      const row = rowOrNull<{ id: string; display_name: string; openclaw_agent_id: string }>(
        db
          .prepare(
            'SELECT id, display_name, openclaw_agent_id FROM agents WHERE openclaw_agent_id = ? AND enabled = 1'
          )
          .all(defaultAgentId) as any
      );
      if (row) return row;
    }
    return rowOrNull<{ id: string; display_name: string; openclaw_agent_id: string }>(
      db
        .prepare(
          'SELECT id, display_name, openclaw_agent_id FROM agents WHERE enabled = 1 ORDER BY created_at ASC LIMIT 1'
        )
        .all() as any
    );
  }

  function ensureTaskSession(taskId: string, agentId?: string | null) {
    const existing = rowOrNull<{ task_id: string; agent_id: string | null; session_key: string }>(
      db.prepare('SELECT task_id, agent_id, session_key FROM task_sessions WHERE task_id = ?').all(taskId) as any
    );
    if (existing) {
      if (agentId && existing.agent_id !== agentId) {
        db.prepare('UPDATE task_sessions SET agent_id = ? WHERE task_id = ?').run(agentId, taskId);
      }
      return rowOrNull<{ task_id: string; agent_id: string | null; session_key: string }>(
        db.prepare('SELECT task_id, agent_id, session_key FROM task_sessions WHERE task_id = ?').all(taskId) as any
      );
    }

    const sessionKey = taskId;
    db.prepare('INSERT INTO task_sessions(task_id, agent_id, session_key) VALUES (?, ?, ?)').run(
      taskId,
      agentId ?? null,
      sessionKey
    );
    return rowOrNull<{ task_id: string; agent_id: string | null; session_key: string }>(
      db.prepare('SELECT task_id, agent_id, session_key FROM task_sessions WHERE task_id = ?').all(taskId) as any
    );
  }

  function replaceChecklistItems(taskId: string, titles: string[]) {
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM task_checklist_items WHERE task_id = ?').run(taskId);
      const ins = db.prepare(
        'INSERT INTO task_checklist_items(id, task_id, title, state, position) VALUES (?, ?, ?, ?, ?)'
      );
      titles.forEach((title, idx) => {
        if (!title.trim()) return;
        ins.run(randomUUID(), taskId, title.trim(), 'todo', idx);
      });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  async function runTask(opts: { taskId: string; mode: 'plan' | 'execute' | 'report'; agentId?: string | null }) {
    const task = getTaskMeta(opts.taskId);
    if (!task) throw new Error('Task not found');

    const session = ensureTaskSession(task.id, opts.agentId ?? null);
    const agentRow = session?.agent_id ? getAgentRowById(session.agent_id) : getDefaultAgentRow();
    const agentOpenClawId = (agentRow?.openclaw_agent_id ?? defaultAgentId) || null;
    const agentDisplayName = agentRow?.display_name ?? 'orchestrator';

    db.prepare('UPDATE task_sessions SET status = ? WHERE task_id = ?').run('running', task.id);

    const runId = randomUUID();
    const stepId = randomUUID();

    db.exec('BEGIN');
    try {
      db.prepare(
        'INSERT INTO agent_runs(id, workspace_id, board_id, task_id, agent_name, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(runId, task.workspace_id, task.board_id, task.id, agentDisplayName, 'running');
      db.prepare(
        'INSERT INTO run_steps(id, run_id, step_index, kind, status, input_json, output_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(stepId, runId, 0, opts.mode, 'running', JSON.stringify({ mode: opts.mode }), null);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    let outputText = '';
    let parsed: any = null;

    try {
      const prompt =
        opts.mode === 'plan'
          ? 'You are a task planner. Return JSON: { "description": "...", "checklist": ["..."] }.'
          : opts.mode === 'execute'
            ? 'You are executing the task. Return JSON: { "status": "review" | "doing", "report": "..." }.'
            : 'Summarize the completion for changelog. Return bullet points.';

      const { text } = await callOpenResponses({
        sessionKey: session?.session_key ?? task.id,
        agentOpenClawId,
        text: `${prompt}\n\nTask title: ${task.title}\nTask description: ${task.description ?? ''}`,
      });

      outputText = text;
      parsed = tryParseJson(text);

      db.prepare(
        "UPDATE run_steps SET status = 'succeeded', output_json = ?, finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?"
      ).run(JSON.stringify({ text: outputText, parsed }), stepId);
      db.prepare(
        "UPDATE agent_runs SET status = 'succeeded', finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?"
      ).run(runId);
    } catch (err: any) {
      db.prepare(
        "UPDATE run_steps SET status = 'failed', output_json = ?, finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?"
      ).run(JSON.stringify({ error: String(err?.message ?? err) }), stepId);
      db.prepare(
        "UPDATE agent_runs SET status = 'failed', finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?"
      ).run(runId);
      throw err;
    } finally {
      db.prepare('UPDATE task_sessions SET last_run_id = ?, status = ? WHERE task_id = ?').run(
        runId,
        'idle',
        task.id
      );
    }

    if (opts.mode === 'plan') {
      const nextDescription =
        typeof parsed?.description === 'string' && parsed.description.trim()
          ? parsed.description.trim()
          : outputText.trim();
      if (nextDescription) {
        db.prepare('UPDATE tasks SET description = ? WHERE id = ?').run(nextDescription, task.id);
      }

      const checklist = Array.isArray(parsed?.checklist)
        ? parsed.checklist.map((c: any) => String(c))
        : [];
      if (checklist.length) {
        replaceChecklistItems(task.id, checklist);
        sseBroadcast({ type: 'task.checklist.changed', payload: { taskId: task.id } });
      }
      sseBroadcast({ type: 'tasks.changed', payload: { taskId: task.id, boardId: task.board_id } });
    }

    if (opts.mode === 'execute') {
      if (parsed?.status === 'review') {
        db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('review', task.id);
        sseBroadcast({ type: 'tasks.changed', payload: { taskId: task.id, boardId: task.board_id } });
      }
    }

    sseBroadcast({ type: 'runs.changed', payload: { runId, taskId: task.id } });

    return { runId, outputText, parsed };
  }

  function isSameOrigin(req: http.IncomingMessage): boolean {
    const origin = req.headers.origin as string | undefined;
    const referer = req.headers.referer as string | undefined;
    const host = req.headers.host ?? '';
    const proto = String(req.headers['x-forwarded-proto'] ?? 'http');
    const base = `${proto}://${host}`;
    const normalize = (v: string) => v.replace(/\/$/, '');

    if (origin) {
      return normalize(origin) === normalize(base);
    }
    if (referer) {
      try {
        const u = new URL(referer);
        return normalize(u.origin) === normalize(base);
      } catch {
        return false;
      }
    }
    return false;
  }

  const server = http.createServer(async (req, res) => {
    const origin = (req.headers.origin as string | undefined) ?? '';
    const corsHeaders: Record<string, string> = {
      'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (origin && isAllowedOrigin(origin, req.headers.host as string | undefined, allowedOrigins)) {
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
      // --- Auth (for domain / reverse-proxy installs) ---
      // This API can act as a Caddy `forward_auth` target.
      // If no auth config exists, we keep auth endpoints usable but do not block API calls here.
      if (req.method === 'GET' && (url.pathname === '/login' || url.pathname === '/')) {
        if (!auth) {
          return sendText(
            res,
            200,
            'DzzenOS API is running. Auth is not configured (missing auth file).',
            corsHeaders
          );
        }

        const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DzzenOS — Sign in</title>
  <style>
    :root{
      color-scheme: dark;
      --background: 222 28% 6%;
      --foreground: 210 28% 96%;
      --surface-1: 222 26% 9%;
      --surface-2: 222 24% 12%;
      --border: 222 16% 22%;
      --muted-foreground: 218 13% 68%;
      --primary: 205 88% 58%;
      --accent: 175 72% 44%;
      --shadow-panel: 0 1px 0 0 hsl(var(--border) / 0.65), 0 18px 40px -28px hsl(222 50% 3% / 0.8);
      --radius-xl: 16px;
      font-family: 'Space Grotesk','Manrope', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
    }
    *{box-sizing:border-box}
    body{
      margin:0;min-height:100vh;
      background:
        radial-gradient(1200px 600px at 10% -10%, hsl(var(--accent) / 0.18), transparent 60%),
        radial-gradient(1000px 700px at 90% 0%, hsl(var(--primary) / 0.16), transparent 55%),
        linear-gradient(180deg, hsl(var(--background)), hsl(var(--background)) 45%, hsl(222 26% 5%));
      color:hsl(var(--foreground));
      display:flex;align-items:center;justify-content:center;padding:28px;
      -webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;
    }
    .wrap{width:100%;max-width:420px}
    .brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}
    .logo{
      width:40px;height:40px;border-radius:12px;
      background:linear-gradient(135deg, hsl(var(--primary)), hsl(262 85% 60%));
      box-shadow:var(--shadow-panel);
    }
    .title{font-weight:700;letter-spacing:.2px}
    .subtitle{color:hsl(var(--muted-foreground));font-size:14px;margin-top:2px}
    .card{
      border:1px solid hsl(var(--border));
      background:linear-gradient(180deg, rgba(255,255,255,.02), transparent 60%), hsl(var(--surface-1));
      border-radius:var(--radius-xl);
      padding:18px 18px 16px;
      box-shadow:var(--shadow-panel)
    }
    label{display:block;font-size:13px;color:hsl(var(--muted-foreground));margin:12px 0 6px}
    input{
      width:100%;padding:12px 12px;border-radius:12px;
      border:1px solid hsl(var(--border));
      background:hsl(var(--surface-2));
      color:hsl(var(--foreground));outline:none
    }
    input:focus{border-color:hsl(var(--primary));box-shadow:0 0 0 4px hsl(var(--primary) / 0.15)}
    button{
      margin-top:14px;width:100%;padding:12px 14px;border-radius:12px;
      border:1px solid hsl(var(--primary) / 0.35);
      background:linear-gradient(135deg, hsl(var(--primary) / 0.92), hsl(262 85% 60% / 0.85));
      color:#07101a;font-weight:700;cursor:pointer
    }
    button:hover{filter:brightness(1.02)}
    .hint{margin-top:12px;color:hsl(var(--muted-foreground));font-size:12px;line-height:1.45}
    .err{margin-top:10px;color:#ffb4b4;font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <div class="logo" aria-hidden="true"></div>
      <div>
        <div class="title">DzzenOS</div>
        <div class="subtitle">Sign in to your DzzenOS</div>
      </div>
    </div>
    <div class="card">
      <form method="POST" action="/auth/login">
        <label for="username">Username</label>
        <input id="username" name="username" autocomplete="username" required />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        <button type="submit">Sign in</button>
      </form>
      ${url.searchParams.get('error') ? `<div class="err">Invalid username or password</div>` : ''}
      <div class="hint">Tip: If you lost credentials, re-run the installer to reset them (server-side).</div>
    </div>
  </div>
</body>
</html>`;

        res.writeHead(200, {
          ...corsHeaders,
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'referrer-policy': 'no-referrer',
          'permissions-policy': 'geolocation=(), microphone=(), camera=()',
          'content-security-policy':
            "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/auth/verify') {
        if (!auth) return sendText(res, 500, 'Auth is not configured', corsHeaders);

        const cookies = parseCookies(req.headers.cookie as string | undefined);
        const v = cookies[auth.cookie.name];
        const ok = v ? verifySessionCookie(auth, v) : null;

        if (!ok) {
          // Caddy forward_auth expects 2xx for OK, anything else = not authorized.
          // We also set a header with the login URL for convenience.
          return sendText(res, 401, 'unauthorized', { ...corsHeaders, 'x-auth-login': '/login' });
        }

        return sendText(res, 200, 'ok', {
          ...corsHeaders,
          'x-auth-user': ok.username,
        });
      }

      if (req.method === 'POST' && url.pathname === '/auth/login') {
        if (!auth) return sendText(res, 500, 'Auth is not configured', corsHeaders);

        // Basic brute-force protection (no deps): per-IP rolling window.
        // Note: behind Caddy, we rely on X-Forwarded-For.
        const ipRaw = String((req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '') as any);
        const ip = ipRaw.split(',')[0]?.trim() || 'unknown';

        // In-memory map: good enough for single-host deployments.
        // If process restarts, counters reset.
        (globalThis as any).__dzzenosAuthAttempts ??= new Map();
        const attempts: Map<string, { firstAt: number; count: number; blockedUntil: number }> = (globalThis as any)
          .__dzzenosAuthAttempts;
        const now = Date.now();
        const windowMs = 10 * 60 * 1000;
        const maxAttempts = 10;
        const blockMs = 30 * 60 * 1000;
        const cur = attempts.get(ip) ?? { firstAt: now, count: 0, blockedUntil: 0 };
        if (cur.blockedUntil > now) {
          return sendText(res, 429, 'Too many attempts. Try later.', {
            ...corsHeaders,
            'retry-after': String(Math.ceil((cur.blockedUntil - now) / 1000)),
          });
        }
        if (now - cur.firstAt > windowMs) {
          cur.firstAt = now;
          cur.count = 0;
        }

        if (!isSameOrigin(req)) {
          return sendText(res, 403, 'Invalid origin', corsHeaders);
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const bodyRaw = Buffer.concat(chunks).toString('utf8');
        const form = new URLSearchParams(bodyRaw);
        const username = String(form.get('username') ?? '').trim();
        const password = String(form.get('password') ?? '');

        const ok = username === auth.username && verifyPassword(auth, password);
        if (!ok) {
          cur.count += 1;
          if (cur.count >= maxAttempts) {
            cur.blockedUntil = now + blockMs;
          }
          attempts.set(ip, cur);

          // Small constant delay to make brute force harder.
          await sleep(250);

          res.writeHead(302, { location: '/login?error=1', ...corsHeaders });
          res.end();
          return;
        }

        // Successful login: reset attempts for IP.
        attempts.delete(ip);

        const s = signSessionCookie(auth, username);
        const sameSite =
          authCookieSameSite.toLowerCase() === 'none'
            ? 'None'
            : authCookieSameSite.toLowerCase() === 'lax'
              ? 'Lax'
              : 'Strict';
        const cookieParts = [
          `${auth.cookie.name}=${encodeURIComponent(s.value)}`,
          'Path=/',
          'HttpOnly',
          `SameSite=${sameSite}`,
          `Expires=${new Date(s.expiresAtMs).toUTCString()}`,
        ];
        if (isRequestSecure(req)) cookieParts.push('Secure');
        const cookie = cookieParts.join('; ');

        res.writeHead(302, {
          ...corsHeaders,
          'set-cookie': cookie,
          location: '/',
        });
        res.end();
        return;
      }

      if (req.method === 'POST' && url.pathname === '/auth/logout') {
        if (!auth) return sendText(res, 200, 'ok', corsHeaders);
        if (!isSameOrigin(req)) {
          return sendText(res, 403, 'Invalid origin', corsHeaders);
        }
        const sameSite =
          authCookieSameSite.toLowerCase() === 'none'
            ? 'None'
            : authCookieSameSite.toLowerCase() === 'lax'
              ? 'Lax'
              : 'Strict';
        const cookieParts = [
          `${auth.cookie.name}=`,
          'Path=/',
          'HttpOnly',
          `SameSite=${sameSite}`,
          'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        ];
        if (isRequestSecure(req)) cookieParts.push('Secure');
        const cookie = cookieParts.join('; ');
        res.writeHead(302, { ...corsHeaders, 'set-cookie': cookie, location: '/login' });
        res.end();
        return;
      }

      // --- Events (SSE) ---
      if (req.method === 'GET' && url.pathname === '/events') {
        // Basic SSE endpoint for real-time UI updates.
        // Client: EventSource(`${API_BASE}/events`).
        const id = randomUUID();

        res.writeHead(200, {
          ...corsHeaders,
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-store, must-revalidate',
          connection: 'keep-alive',
          // Disable buffering in some proxies
          'x-accel-buffering': 'no',
        });

        res.write(`event: dzzenos\n`);
        res.write(`data: ${JSON.stringify({ ts: Date.now(), type: 'hello' })}\n\n`);

        sseClients.set(id, { id, res });

        req.on('close', () => {
          sseClients.delete(id);
        });

        return;
      }

      // --- API ---
      if (req.method === 'GET' && url.pathname === '/runs') {
        const status = url.searchParams.get('status');
        const stuckMinutesRaw = url.searchParams.get('stuckMinutes');
        const stuckMinutes = stuckMinutesRaw == null ? null : Number(stuckMinutesRaw);

        const allowedStatus = new Set(['running', 'succeeded', 'failed', 'cancelled']);
        if (status && !allowedStatus.has(status)) {
          return sendJson(res, 400, { error: 'status must be one of: running, succeeded, failed, cancelled' }, corsHeaders);
        }
        if (stuckMinutesRaw != null && (!Number.isFinite(stuckMinutes) || stuckMinutes < 0)) {
          return sendJson(res, 400, { error: 'stuckMinutes must be a non-negative number' }, corsHeaders);
        }

        const where: string[] = [];
        const params: any[] = [];

        if (status) {
          where.push('r.status = ?');
          params.push(status);
        }

        // If stuckMinutes is provided, return only stuck running runs older than N minutes.
        if (stuckMinutes != null) {
          where.push("r.status = 'running'");
          where.push("julianday(r.created_at) < julianday('now') - (? / 1440.0)");
          params.push(stuckMinutes);
        }

        const sql = `
          SELECT
            r.id,
            r.workspace_id,
            r.board_id,
            r.task_id,
            r.agent_name,
            r.status,
            r.started_at,
            r.finished_at,
            r.created_at,
            r.updated_at,
            t.title as task_title,
            CASE
              WHEN r.status = 'running' AND julianday(r.created_at) < julianday('now') - (? / 1440.0) THEN 1
              ELSE 0
            END as is_stuck
          FROM agent_runs r
          LEFT JOIN tasks t ON t.id = r.task_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY r.created_at DESC
          LIMIT 200
        `;

        const isStuckMinutes = stuckMinutes != null ? stuckMinutes : 5;
        const rows = db.prepare(sql).all(...params, isStuckMinutes) as any[];
        const payload = rows.map((r) => ({ ...r, is_stuck: Boolean(r.is_stuck) }));
        return sendJson(res, 200, payload, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/approvals') {
        const status = url.searchParams.get('status');
        const allowed = new Set(['pending', 'approved', 'rejected']);
        if (status && !allowed.has(status)) {
          return sendJson(res, 400, { error: 'status must be one of: pending, approved, rejected' }, corsHeaders);
        }

        const where: string[] = [];
        const params: any[] = [];
        if (status) {
          where.push('a.status = ?');
          params.push(status);
        }

        const approvals = db
          .prepare(
            `SELECT
               a.id,
               a.run_id,
               a.step_id,
               a.status,
               a.request_title,
               a.request_body,
               a.requested_at,
               a.decided_at,
               a.decided_by,
               a.decision_reason,
               a.created_at,
               a.updated_at,
               r.task_id as task_id,
               r.board_id as board_id,
               t.title as task_title
             FROM approvals a
             JOIN agent_runs r ON r.id = a.run_id
             LEFT JOIN tasks t ON t.id = r.task_id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY a.requested_at DESC
             LIMIT 200`
          )
          .all(...params);


        return sendJson(res, 200, approvals, corsHeaders);
      }

      const approvalDecideMatch = req.method === 'POST'
        ? url.pathname.match(/^\/approvals\/([^/]+)\/(approve|reject)$/)
        : null;
      if (approvalDecideMatch) {
        const id = decodeURIComponent(approvalDecideMatch[1]);
        const action = approvalDecideMatch[2];

        const body = await readJson(req);
        const decidedBy = typeof body?.decidedBy === 'string' ? body.decidedBy.trim() : null;
        const reason = typeof body?.reason === 'string' ? body.reason : null;

        const existing = rowOrNull<{ id: string; status: string }>(
          db.prepare('SELECT id, status FROM approvals WHERE id = ?').all(id) as any
        );
        if (!existing) return sendJson(res, 404, { error: 'Approval not found' }, corsHeaders);
        if (existing.status !== 'pending') {
          return sendJson(res, 409, { error: `Approval already decided (${existing.status})` }, corsHeaders);
        }

        const nextStatus = action === 'approve' ? 'approved' : 'rejected';
        const info = db
          .prepare(
            `UPDATE approvals
             SET status = ?,
                 decided_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                 decided_by = ?,
                 decision_reason = ?
             WHERE id = ? AND status = 'pending'`
          )
          .run(nextStatus, decidedBy, reason, id);

        const approvalMeta = rowOrNull<{ task_id: string | null; board_id: string | null }>(
          db
            .prepare(
              `SELECT r.task_id as task_id, r.board_id as board_id
               FROM approvals a
               JOIN agent_runs r ON r.id = a.run_id
               WHERE a.id = ?`
            )
            .all(id) as any
        );

        sseBroadcast({
          type: 'approvals.changed',
          payload: { approvalId: id, status: nextStatus, taskId: approvalMeta?.task_id ?? null, boardId: approvalMeta?.board_id ?? null },
        });
        if (info.changes === 0) {
          return sendJson(res, 409, { error: 'Approval already decided' }, corsHeaders);
        }

        const row = rowOrNull<any>(
          db
            .prepare(
              `SELECT
                 a.id,
                 a.run_id,
                 a.step_id,
                 a.status,
                 a.request_title,
                 a.request_body,
                 a.requested_at,
                 a.decided_at,
                 a.decided_by,
                 a.decision_reason,
                 a.created_at,
                 a.updated_at,
                 r.task_id as task_id,
                 r.board_id as board_id,
                 t.title as task_title
               FROM approvals a
               JOIN agent_runs r ON r.id = a.run_id
               LEFT JOIN tasks t ON t.id = r.task_id
               WHERE a.id = ?`
            )
            .all(id) as any
        );
        return sendJson(res, 200, row, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/automations') {
        const rows = db
          .prepare('SELECT id, name, description, created_at, updated_at FROM automations ORDER BY created_at DESC')
          .all();
        return sendJson(res, 200, rows, corsHeaders);
      }

      const automationGetMatch = req.method === 'GET' ? url.pathname.match(/^\/automations\/([^/]+)$/) : null;
      if (automationGetMatch) {
        const id = decodeURIComponent(automationGetMatch[1]);
        const row = rowOrNull<any>(
          db
            .prepare('SELECT id, name, description, graph_json, created_at, updated_at FROM automations WHERE id = ?')
            .all(id) as any
        );
        if (!row) return sendJson(res, 404, { error: 'Automation not found' }, corsHeaders);
        return sendJson(res, 200, row, corsHeaders);
      }

      if (req.method === 'POST' && url.pathname === '/automations') {
        const body = await readJson(req);
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        const description = typeof body?.description === 'string' ? body.description : null;

        const graph = body?.graph ?? body?.graph_json ?? body?.graphJson;
        const graphJson =
          typeof graph === 'string'
            ? graph
            : graph && typeof graph === 'object'
              ? JSON.stringify(graph)
              : JSON.stringify({ nodes: [], edges: [] });

        const id = randomUUID();
        db.prepare('INSERT INTO automations(id, name, description, graph_json) VALUES (?, ?, ?, ?)').run(
          id,
          name || 'Untitled automation',
          description,
          graphJson
        );

        const row = rowOrNull<any>(
          db
            .prepare('SELECT id, name, description, graph_json, created_at, updated_at FROM automations WHERE id = ?')
            .all(id) as any
        );
        return sendJson(res, 201, row, corsHeaders);
      }

      const automationPutMatch = req.method === 'PUT' ? url.pathname.match(/^\/automations\/([^/]+)$/) : null;
      if (automationPutMatch) {
        const id = decodeURIComponent(automationPutMatch[1]);
        const body = await readJson(req);

        const updates: string[] = [];
        const params: any[] = [];

        if (body?.name !== undefined) {
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (!name) return sendJson(res, 400, { error: 'name must be a non-empty string' }, corsHeaders);
          updates.push('name = ?');
          params.push(name);
        }

        if (body?.description !== undefined) {
          const description = body.description === null ? null : typeof body.description === 'string' ? body.description : undefined;
          if (description === undefined) return sendJson(res, 400, { error: 'description must be a string or null' }, corsHeaders);
          updates.push('description = ?');
          params.push(description);
        }

        if (body?.graph !== undefined || body?.graph_json !== undefined || body?.graphJson !== undefined) {
          const graph = body?.graph ?? body?.graph_json ?? body?.graphJson;
          const graphJson =
            typeof graph === 'string'
              ? graph
              : graph && typeof graph === 'object'
                ? JSON.stringify(graph)
                : undefined;
          if (graphJson === undefined) return sendJson(res, 400, { error: 'graph must be a JSON object or string' }, corsHeaders);
          updates.push('graph_json = ?');
          params.push(graphJson);
        }

        if (updates.length === 0) {
          return sendJson(res, 400, { error: 'No valid fields to update (name/description/graph)' }, corsHeaders);
        }

        params.push(id);
        const info = db.prepare(`UPDATE automations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Automation not found' }, corsHeaders);

        const row = rowOrNull<any>(
          db
            .prepare('SELECT id, name, description, graph_json, created_at, updated_at FROM automations WHERE id = ?')
            .all(id) as any
        );
        return sendJson(res, 200, row, corsHeaders);
      }

      // Optional stub: create an agent_run + steps for an automation (dev-only)
      const automationRunMatch = req.method === 'POST' ? url.pathname.match(/^\/automations\/([^/]+)\/run$/) : null;
      if (automationRunMatch) {
        const id = decodeURIComponent(automationRunMatch[1]);
        const a = rowOrNull<{ id: string }>(db.prepare('SELECT id FROM automations WHERE id = ?').all(id) as any);
        if (!a) return sendJson(res, 404, { error: 'Automation not found' }, corsHeaders);

        const workspaceId = rowOrNull<{ id: string }>(db.prepare('SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1').all() as any)?.id;
        if (!workspaceId) return sendJson(res, 400, { error: 'No workspace exists' }, corsHeaders);

        const runId = randomUUID();
        const stepIds = [randomUUID(), randomUUID()];

        db.exec('BEGIN');
        try {
          db.prepare(
            'INSERT INTO agent_runs(id, workspace_id, board_id, task_id, agent_name, status) VALUES (?, ?, NULL, NULL, ?, ?)'
          ).run(runId, workspaceId, `automation:${id}`, 'running');

          const ins = db.prepare(
            'INSERT INTO run_steps(id, run_id, step_index, kind, status, input_json, output_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
          );
          ins.run(stepIds[0], runId, 0, 'automation.plan', 'succeeded', JSON.stringify({ automationId: id }), null);
          ins.run(stepIds[1], runId, 1, 'automation.run', 'running', JSON.stringify({ automationId: id }), null);

          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }

        sseBroadcast({ type: 'runs.changed', payload: { runId, automationId: id } });
        return sendJson(res, 201, { runId }, corsHeaders);
      }

      // --- Skills (installed) ---
      if (req.method === 'GET' && url.pathname === '/skills') {
        const rows = db
          .prepare(
            `SELECT slug, display_name, description, tier, enabled, source, preset_key, sort_order, capabilities_json, created_at, updated_at
               FROM installed_skills
              ORDER BY enabled DESC, sort_order ASC, COALESCE(display_name, slug) ASC, slug ASC`
          )
          .all() as any[];
        return sendJson(res, 200, rows.map(skillRowToDto), corsHeaders);
      }

      if (req.method === 'POST' && url.pathname === '/skills') {
        const body = await readJson(req);
        const slug = normalizeString(body?.slug);
        if (!slug) return sendJson(res, 400, { error: 'slug is required' }, corsHeaders);

        const existing = rowOrNull<{ slug: string }>(
          db.prepare('SELECT slug FROM installed_skills WHERE slug = ? LIMIT 1').all(slug) as any
        );
        if (existing) return sendJson(res, 409, { error: 'Skill already installed' }, corsHeaders);

        const displayName = normalizeString(body?.display_name ?? body?.displayName) || null;
        const description = typeof body?.description === 'string' ? body.description : null;
        const tier = normalizeString(body?.tier) || 'community';
        const enabled = body?.enabled === false ? 0 : 1;
        const capabilities = parseCapabilitiesJson(body?.capabilities ?? body?.capabilities_json);

        db.prepare(
          `INSERT INTO installed_skills(
            slug, display_name, description, tier, enabled, source, preset_key, preset_defaults_json, sort_order, capabilities_json
          ) VALUES (?, ?, ?, ?, ?, 'manual', NULL, NULL, 0, ?)`
        ).run(slug, displayName, description, tier, enabled, jsonStringifyCapabilities(capabilities));

        const row = rowOrNull<any>(
          db
            .prepare(
              `SELECT slug, display_name, description, tier, enabled, source, preset_key, sort_order, capabilities_json, created_at, updated_at
                 FROM installed_skills
                WHERE slug = ?`
            )
            .all(slug) as any
        );

        sseBroadcast({ type: 'skills.changed', payload: {} });
        return sendJson(res, 201, row ? skillRowToDto(row) : { slug }, corsHeaders);
      }

      const skillPatchMatch = req.method === 'PATCH' ? url.pathname.match(/^\/skills\/([^/]+)$/) : null;
      if (skillPatchMatch) {
        const slug = decodeURIComponent(skillPatchMatch[1]);
        const body = await readJson(req);
        const updates: string[] = [];
        const params: any[] = [];

        if (body?.display_name !== undefined || body?.displayName !== undefined) {
          const displayName = normalizeString(body?.display_name ?? body?.displayName) || null;
          updates.push('display_name = ?');
          params.push(displayName);
        }

        if (body?.description !== undefined) {
          const description = body.description === null ? null : typeof body.description === 'string' ? body.description : undefined;
          if (description === undefined) return sendJson(res, 400, { error: 'description must be a string or null' }, corsHeaders);
          updates.push('description = ?');
          params.push(description);
        }

        if (body?.tier !== undefined) {
          const tier = normalizeString(body.tier) || 'community';
          updates.push('tier = ?');
          params.push(tier);
        }

        if (body?.enabled !== undefined) {
          updates.push('enabled = ?');
          params.push(body.enabled === false ? 0 : 1);
        }

        if (body?.capabilities !== undefined || body?.capabilities_json !== undefined) {
          const capabilities = parseCapabilitiesJson(body?.capabilities ?? body?.capabilities_json);
          updates.push('capabilities_json = ?');
          params.push(jsonStringifyCapabilities(capabilities));
        }

        if (!updates.length) return sendJson(res, 400, { error: 'No valid fields to update' }, corsHeaders);

        params.push(slug);
        const info = db.prepare(`UPDATE installed_skills SET ${updates.join(', ')} WHERE slug = ?`).run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Skill not found' }, corsHeaders);

        const row = rowOrNull<any>(
          db
            .prepare(
              `SELECT slug, display_name, description, tier, enabled, source, preset_key, sort_order, capabilities_json, created_at, updated_at
                 FROM installed_skills
                WHERE slug = ?`
            )
            .all(slug) as any
        );

        sseBroadcast({ type: 'skills.changed', payload: {} });
        return sendJson(res, 200, row ? skillRowToDto(row) : { slug }, corsHeaders);
      }

      const skillResetMatch = req.method === 'POST' ? url.pathname.match(/^\/skills\/([^/]+)\/reset$/) : null;
      if (skillResetMatch) {
        const slug = decodeURIComponent(skillResetMatch[1]);
        const row = rowOrNull<{ preset_key: string | null; preset_defaults_json: string | null }>(
          db.prepare('SELECT preset_key, preset_defaults_json FROM installed_skills WHERE slug = ?').all(slug) as any
        );
        if (!row) return sendJson(res, 404, { error: 'Skill not found' }, corsHeaders);
        if (!row.preset_key || !row.preset_defaults_json) {
          return sendJson(res, 400, { error: 'Reset is only available for installed presets' }, corsHeaders);
        }

        const defaults = (() => {
          try {
            return JSON.parse(row.preset_defaults_json as string);
          } catch {
            return null;
          }
        })();
        if (!defaults || typeof defaults !== 'object') return sendJson(res, 500, { error: 'Invalid preset defaults' }, corsHeaders);

        db.prepare(
          `UPDATE installed_skills
             SET display_name = ?,
                 description = ?,
                 tier = ?,
                 enabled = ?,
                 source = ?,
                 sort_order = ?,
                 capabilities_json = ?
           WHERE slug = ?`
        ).run(
          typeof (defaults as any).display_name === 'string' ? (defaults as any).display_name : null,
          typeof (defaults as any).description === 'string' ? (defaults as any).description : null,
          normalizeString((defaults as any).tier) || 'official',
          (defaults as any).enabled === false ? 0 : 1,
          normalizeString((defaults as any).source) || 'marketplace',
          Number.isFinite(Number((defaults as any).sort_order)) ? Number((defaults as any).sort_order) : 0,
          jsonStringifyCapabilities(parseCapabilitiesJson((defaults as any).capabilities)),
          slug
        );

        const updated = rowOrNull<any>(
          db
            .prepare(
              `SELECT slug, display_name, description, tier, enabled, source, preset_key, sort_order, capabilities_json, created_at, updated_at
                 FROM installed_skills
                WHERE slug = ?`
            )
            .all(slug) as any
        );

        sseBroadcast({ type: 'skills.changed', payload: {} });
        return sendJson(res, 200, updated ? skillRowToDto(updated) : { slug }, corsHeaders);
      }

      const skillDeleteMatch = req.method === 'DELETE' ? url.pathname.match(/^\/skills\/([^/]+)$/) : null;
      if (skillDeleteMatch) {
        const slug = decodeURIComponent(skillDeleteMatch[1]);
        const info = db.prepare('DELETE FROM installed_skills WHERE slug = ?').run(slug);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Skill not found' }, corsHeaders);
        sseBroadcast({ type: 'skills.changed', payload: {} });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      // --- Skills marketplace ---
      if (req.method === 'GET' && url.pathname === '/marketplace/skills') {
        const installedRows = db.prepare('SELECT slug FROM installed_skills').all() as any[];
        const installed = new Set<string>();
        for (const r of installedRows) {
          if (typeof r?.slug === 'string') installed.add(r.slug);
        }

        const payload = MARKETPLACE_SKILLS.map((p) => ({
          ...p,
          installed: installed.has(p.slug),
        }));

        return sendJson(res, 200, payload, corsHeaders);
      }

      const marketplaceSkillInstallMatch = req.method === 'POST'
        ? url.pathname.match(/^\/marketplace\/skills\/([^/]+)\/install$/)
        : null;
      if (marketplaceSkillInstallMatch) {
        const presetKey = decodeURIComponent(marketplaceSkillInstallMatch[1]);
        const preset = getMarketplaceSkillPreset(presetKey);
        if (!preset) return sendJson(res, 404, { error: 'Preset not found' }, corsHeaders);
        if (preset.requires_subscription) {
          return sendJson(res, 403, { error: 'Subscription required' }, corsHeaders);
        }

        const existing = rowOrNull<{ slug: string }>(
          db.prepare('SELECT slug FROM installed_skills WHERE slug = ? LIMIT 1').all(preset.slug) as any
        );
        if (existing?.slug) return sendJson(res, 200, { slug: existing.slug }, corsHeaders);

        const presetDefaults = {
          preset_key: preset.preset_key,
          slug: preset.slug,
          display_name: preset.display_name,
          description: preset.description,
          tier: preset.tier,
          enabled: true,
          source: 'marketplace',
          sort_order: preset.sort_order,
          capabilities: preset.capabilities,
        };

        db.prepare(
          `INSERT INTO installed_skills(
            slug, display_name, description, tier, enabled, source, preset_key, preset_defaults_json, sort_order, capabilities_json
          ) VALUES (?, ?, ?, ?, 1, 'marketplace', ?, ?, ?, ?)`
        ).run(
          preset.slug,
          preset.display_name,
          preset.description,
          preset.tier,
          preset.preset_key,
          JSON.stringify(presetDefaults),
          preset.sort_order,
          jsonStringifyCapabilities(preset.capabilities)
        );

        sseBroadcast({ type: 'skills.changed', payload: {} });
        return sendJson(res, 201, { slug: preset.slug }, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/marketplace/agents') {
        const installedRows = db
          .prepare('SELECT id, preset_key FROM agents WHERE preset_key IS NOT NULL')
          .all() as any[];
        const installedByKey = new Map<string, string>();
        for (const r of installedRows) {
          if (typeof r?.preset_key === 'string' && typeof r?.id === 'string') installedByKey.set(r.preset_key, r.id);
        }

        const payload = MARKETPLACE_AGENTS.map((p) => ({
          ...p,
          installed: installedByKey.has(p.preset_key),
          installed_agent_id: installedByKey.get(p.preset_key) ?? null,
        }));
        return sendJson(res, 200, payload, corsHeaders);
      }

      const marketplaceInstallMatch = req.method === 'POST'
        ? url.pathname.match(/^\/marketplace\/agents\/([^/]+)\/install$/)
        : null;
      if (marketplaceInstallMatch) {
        const presetKey = decodeURIComponent(marketplaceInstallMatch[1]);
        const preset = getMarketplaceAgentPreset(presetKey);
        if (!preset) return sendJson(res, 404, { error: 'Preset not found' }, corsHeaders);
        if (preset.requires_subscription) {
          return sendJson(res, 403, { error: 'Subscription required' }, corsHeaders);
        }

        const existing = rowOrNull<{ id: string }>(
          db.prepare('SELECT id FROM agents WHERE preset_key = ? LIMIT 1').all(presetKey) as any
        );
        if (existing?.id) return sendJson(res, 200, { id: existing.id }, corsHeaders);

        const id = randomUUID();
        const enabled = 1;
        const role = 'orchestrator';
        const openclawAgentId = DEFAULT_OPENCLAW_AGENT_ID;

        const presetDefaults = {
          preset_key: preset.preset_key,
          display_name: preset.display_name,
          emoji: preset.emoji,
          description: preset.description,
          category: preset.category,
          tags: preset.tags,
          skills: preset.skills,
          prompt_overrides: preset.prompt_overrides,
          openclaw_agent_id: openclawAgentId,
          enabled: true,
          role,
          sort_order: preset.sort_order,
        };

        db.prepare(
          `INSERT INTO agents(
            id, display_name, emoji, openclaw_agent_id, enabled, role,
            description, category, tags_json, skills_json, prompt_overrides_json,
            preset_key, preset_defaults_json, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          preset.display_name,
          preset.emoji,
          openclawAgentId,
          enabled,
          role,
          preset.description,
          preset.category,
          jsonStringifyArray(preset.tags),
          jsonStringifyArray(preset.skills),
          jsonStringifyPromptOverrides(preset.prompt_overrides),
          preset.preset_key,
          JSON.stringify(presetDefaults),
          preset.sort_order
        );

        sseBroadcast({ type: 'agents.changed', payload: {} });
        return sendJson(res, 201, { id }, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/agents') {
        const rows = db
          .prepare(
            `SELECT
              a.id, a.display_name, a.emoji, a.openclaw_agent_id, a.enabled, a.role,
              a.description, a.category, a.tags_json, a.skills_json, a.prompt_overrides_json,
              a.preset_key, a.sort_order, a.created_at, a.updated_at,
              (SELECT COUNT(*) FROM task_sessions ts WHERE ts.agent_id = a.id) as assigned_task_count,
              (SELECT MAX(ar.started_at)
                 FROM task_sessions ts
                 JOIN agent_runs ar ON ar.task_id = ts.task_id
                WHERE ts.agent_id = a.id) as last_used_at,
              (SELECT COUNT(*)
                 FROM task_sessions ts
                 JOIN agent_runs ar ON ar.task_id = ts.task_id
                WHERE ts.agent_id = a.id
                  AND datetime(ar.started_at) >= datetime('now','-7 day')) as run_count_7d
             FROM agents a
             ORDER BY a.enabled DESC, a.sort_order ASC, a.display_name ASC`
          )
          .all() as any[];

        return sendJson(res, 200, rows.map(agentRowToDto), corsHeaders);
      }

      if (req.method === 'POST' && url.pathname === '/agents') {
        const body = await readJson(req);

        const displayName = normalizeString(body?.display_name ?? body?.displayName);
        const openclawAgentId = normalizeString(body?.openclaw_agent_id ?? body?.openclawAgentId);
        if (!displayName) return sendJson(res, 400, { error: 'display_name is required' }, corsHeaders);
        if (!openclawAgentId) return sendJson(res, 400, { error: 'openclaw_agent_id is required' }, corsHeaders);

        const id = randomUUID();
        const emoji = normalizeString(body?.emoji) || null;
        const role = normalizeString(body?.role) || null;
        const enabled = body?.enabled === false ? 0 : 1;
        const description = body?.description === null ? null : typeof body?.description === 'string' ? body.description : null;
        const category = normalizeString(body?.category) || 'general';
        const tags = Array.isArray(body?.tags) ? body.tags : parseStringArrayJson(body?.tags_json);
        const skills = Array.isArray(body?.skills) ? body.skills : parseStringArrayJson(body?.skills_json);
        const promptOverrides = parsePromptOverridesJson(body?.prompt_overrides ?? body?.prompt_overrides_json);
        const sortOrder = Number.isFinite(Number(body?.sort_order)) ? Number(body.sort_order) : 0;

        db.prepare(
          `INSERT INTO agents(
            id, display_name, emoji, openclaw_agent_id, enabled, role,
            description, category, tags_json, skills_json, prompt_overrides_json,
            preset_key, preset_defaults_json, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`
        ).run(
          id,
          displayName,
          emoji,
          openclawAgentId,
          enabled,
          role,
          description,
          category,
          jsonStringifyArray(tags),
          jsonStringifyArray(skills),
          jsonStringifyPromptOverrides(promptOverrides),
          sortOrder
        );

        const row = rowOrNull<any>(
          db
            .prepare(
              `SELECT
                a.id, a.display_name, a.emoji, a.openclaw_agent_id, a.enabled, a.role,
                a.description, a.category, a.tags_json, a.skills_json, a.prompt_overrides_json,
                a.preset_key, a.sort_order, a.created_at, a.updated_at,
                (SELECT COUNT(*) FROM task_sessions ts WHERE ts.agent_id = a.id) as assigned_task_count,
                (SELECT MAX(ar.started_at)
                   FROM task_sessions ts
                   JOIN agent_runs ar ON ar.task_id = ts.task_id
                  WHERE ts.agent_id = a.id) as last_used_at,
                (SELECT COUNT(*)
                   FROM task_sessions ts
                   JOIN agent_runs ar ON ar.task_id = ts.task_id
                  WHERE ts.agent_id = a.id
                    AND datetime(ar.started_at) >= datetime('now','-7 day')) as run_count_7d
               FROM agents a
               WHERE a.id = ?`
            )
            .all(id) as any
        );

        sseBroadcast({ type: 'agents.changed', payload: {} });
        return sendJson(res, 201, row ? agentRowToDto(row) : { id }, corsHeaders);
      }

      const agentPatchMatch = req.method === 'PATCH' ? url.pathname.match(/^\/agents\/([^/]+)$/) : null;
      if (agentPatchMatch) {
        const id = decodeURIComponent(agentPatchMatch[1]);
        const body = await readJson(req);

        const updates: string[] = [];
        const params: any[] = [];

        if (body?.display_name !== undefined || body?.displayName !== undefined) {
          const displayName = normalizeString(body?.display_name ?? body?.displayName);
          if (!displayName) return sendJson(res, 400, { error: 'display_name must be a non-empty string' }, corsHeaders);
          updates.push('display_name = ?');
          params.push(displayName);
        }

        if (body?.emoji !== undefined) {
          const emoji = body.emoji === null ? null : normalizeString(body.emoji) || null;
          updates.push('emoji = ?');
          params.push(emoji);
        }

        if (body?.openclaw_agent_id !== undefined || body?.openclawAgentId !== undefined) {
          const openclawAgentId = normalizeString(body?.openclaw_agent_id ?? body?.openclawAgentId);
          if (!openclawAgentId) return sendJson(res, 400, { error: 'openclaw_agent_id must be a non-empty string' }, corsHeaders);
          updates.push('openclaw_agent_id = ?');
          params.push(openclawAgentId);
        }

        if (body?.enabled !== undefined) {
          const enabled = body.enabled === false ? 0 : 1;
          updates.push('enabled = ?');
          params.push(enabled);
        }

        if (body?.role !== undefined) {
          const role = body.role === null ? null : normalizeString(body.role) || null;
          updates.push('role = ?');
          params.push(role);
        }

        if (body?.description !== undefined) {
          const description =
            body.description === null ? null : typeof body.description === 'string' ? body.description : undefined;
          if (description === undefined) return sendJson(res, 400, { error: 'description must be a string or null' }, corsHeaders);
          updates.push('description = ?');
          params.push(description);
        }

        if (body?.category !== undefined) {
          const category = normalizeString(body.category) || 'general';
          updates.push('category = ?');
          params.push(category);
        }

        if (body?.tags !== undefined || body?.tags_json !== undefined) {
          const tags = Array.isArray(body?.tags) ? body.tags : parseStringArrayJson(body?.tags_json);
          updates.push('tags_json = ?');
          params.push(jsonStringifyArray(tags));
        }

        if (body?.skills !== undefined || body?.skills_json !== undefined) {
          const skills = Array.isArray(body?.skills) ? body.skills : parseStringArrayJson(body?.skills_json);
          updates.push('skills_json = ?');
          params.push(jsonStringifyArray(skills));
        }

        if (body?.prompt_overrides !== undefined || body?.prompt_overrides_json !== undefined) {
          const promptOverrides = parsePromptOverridesJson(body?.prompt_overrides ?? body?.prompt_overrides_json);
          updates.push('prompt_overrides_json = ?');
          params.push(jsonStringifyPromptOverrides(promptOverrides));
        }

        if (body?.sort_order !== undefined) {
          const sortOrder = Number(body.sort_order);
          if (!Number.isFinite(sortOrder)) return sendJson(res, 400, { error: 'sort_order must be a number' }, corsHeaders);
          updates.push('sort_order = ?');
          params.push(sortOrder);
        }

        if (!updates.length) return sendJson(res, 400, { error: 'No valid fields to update' }, corsHeaders);

        params.push(id);
        const info = db.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);

        const row = rowOrNull<any>(
          db
            .prepare(
              `SELECT
                a.id, a.display_name, a.emoji, a.openclaw_agent_id, a.enabled, a.role,
                a.description, a.category, a.tags_json, a.skills_json, a.prompt_overrides_json,
                a.preset_key, a.sort_order, a.created_at, a.updated_at,
                (SELECT COUNT(*) FROM task_sessions ts WHERE ts.agent_id = a.id) as assigned_task_count,
                (SELECT MAX(ar.started_at)
                   FROM task_sessions ts
                   JOIN agent_runs ar ON ar.task_id = ts.task_id
                  WHERE ts.agent_id = a.id) as last_used_at,
                (SELECT COUNT(*)
                   FROM task_sessions ts
                   JOIN agent_runs ar ON ar.task_id = ts.task_id
                  WHERE ts.agent_id = a.id
                    AND datetime(ar.started_at) >= datetime('now','-7 day')) as run_count_7d
               FROM agents a
               WHERE a.id = ?`
            )
            .all(id) as any
        );

        sseBroadcast({ type: 'agents.changed', payload: {} });
        return sendJson(res, 200, row ? agentRowToDto(row) : { id }, corsHeaders);
      }

      const agentResetMatch = req.method === 'POST' ? url.pathname.match(/^\/agents\/([^/]+)\/reset$/) : null;
      if (agentResetMatch) {
        const id = decodeURIComponent(agentResetMatch[1]);
        const row = rowOrNull<{ preset_key: string | null; preset_defaults_json: string | null }>(
          db.prepare('SELECT preset_key, preset_defaults_json FROM agents WHERE id = ?').all(id) as any
        );
        if (!row) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);
        if (!row.preset_key || !row.preset_defaults_json) {
          return sendJson(res, 400, { error: 'Reset is only available for installed presets' }, corsHeaders);
        }

        const defaults = (() => {
          try {
            return JSON.parse(row.preset_defaults_json as string);
          } catch {
            return null;
          }
        })();
        if (!defaults || typeof defaults !== 'object') {
          return sendJson(res, 500, { error: 'Invalid preset defaults' }, corsHeaders);
        }

        db.prepare(
          `UPDATE agents
             SET display_name = ?,
                 emoji = ?,
                 openclaw_agent_id = ?,
                 enabled = ?,
                 role = ?,
                 description = ?,
                 category = ?,
                 tags_json = ?,
                 skills_json = ?,
                 prompt_overrides_json = ?,
                 sort_order = ?
           WHERE id = ?`
        ).run(
          normalizeString((defaults as any).display_name) || normalizeString((defaults as any).displayName) || 'Agent',
          (defaults as any).emoji ?? null,
          normalizeString((defaults as any).openclaw_agent_id) || DEFAULT_OPENCLAW_AGENT_ID,
          (defaults as any).enabled === false ? 0 : 1,
          normalizeString((defaults as any).role) || 'orchestrator',
          typeof (defaults as any).description === 'string' ? (defaults as any).description : null,
          normalizeString((defaults as any).category) || 'general',
          jsonStringifyArray(Array.isArray((defaults as any).tags) ? (defaults as any).tags : []),
          jsonStringifyArray(Array.isArray((defaults as any).skills) ? (defaults as any).skills : []),
          jsonStringifyPromptOverrides(parsePromptOverridesJson((defaults as any).prompt_overrides)),
          Number.isFinite(Number((defaults as any).sort_order)) ? Number((defaults as any).sort_order) : 0,
          id
        );

        const updated = rowOrNull<any>(
          db
            .prepare(
              `SELECT
                a.id, a.display_name, a.emoji, a.openclaw_agent_id, a.enabled, a.role,
                a.description, a.category, a.tags_json, a.skills_json, a.prompt_overrides_json,
                a.preset_key, a.sort_order, a.created_at, a.updated_at,
                (SELECT COUNT(*) FROM task_sessions ts WHERE ts.agent_id = a.id) as assigned_task_count,
                (SELECT MAX(ar.started_at)
                   FROM task_sessions ts
                   JOIN agent_runs ar ON ar.task_id = ts.task_id
                  WHERE ts.agent_id = a.id) as last_used_at,
                (SELECT COUNT(*)
                   FROM task_sessions ts
                   JOIN agent_runs ar ON ar.task_id = ts.task_id
                  WHERE ts.agent_id = a.id
                    AND datetime(ar.started_at) >= datetime('now','-7 day')) as run_count_7d
               FROM agents a
               WHERE a.id = ?`
            )
            .all(id) as any
        );

        sseBroadcast({ type: 'agents.changed', payload: {} });
        return sendJson(res, 200, updated ? agentRowToDto(updated) : { id }, corsHeaders);
      }

      const agentDuplicateMatch = req.method === 'POST' ? url.pathname.match(/^\/agents\/([^/]+)\/duplicate$/) : null;
      if (agentDuplicateMatch) {
        const id = decodeURIComponent(agentDuplicateMatch[1]);
        const src = rowOrNull<any>(
          db
            .prepare(
              `SELECT
                id, display_name, emoji, openclaw_agent_id, enabled, role,
                description, category, tags_json, skills_json, prompt_overrides_json, sort_order
               FROM agents
               WHERE id = ?`
            )
            .all(id) as any
        );
        if (!src) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);

        const newId = randomUUID();
        const displayName = `${String(src.display_name ?? 'Agent')} (copy)`;

        db.prepare(
          `INSERT INTO agents(
            id, display_name, emoji, openclaw_agent_id, enabled, role,
            description, category, tags_json, skills_json, prompt_overrides_json,
            preset_key, preset_defaults_json, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`
        ).run(
          newId,
          displayName,
          src.emoji ?? null,
          String(src.openclaw_agent_id ?? DEFAULT_OPENCLAW_AGENT_ID),
          src.enabled === 0 ? 0 : 1,
          src.role ?? null,
          src.description ?? null,
          String(src.category ?? 'general'),
          typeof src.tags_json === 'string' ? src.tags_json : '[]',
          typeof src.skills_json === 'string' ? src.skills_json : '[]',
          typeof src.prompt_overrides_json === 'string' ? src.prompt_overrides_json : '{}',
          Number.isFinite(Number(src.sort_order)) ? Number(src.sort_order) : 0
        );

        sseBroadcast({ type: 'agents.changed', payload: {} });
        return sendJson(res, 201, { id: newId }, corsHeaders);
      }

      const deleteAgentMatch = req.method === 'DELETE' ? url.pathname.match(/^\/agents\/([^/]+)$/) : null;
      if (deleteAgentMatch) {
        const id = decodeURIComponent(deleteAgentMatch[1]);
        const row = rowOrNull<{ preset_key: string | null }>(
          db.prepare('SELECT preset_key FROM agents WHERE id = ?').all(id) as any
        );
        if (!row) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);
        if (row.preset_key) {
          return sendJson(res, 400, { error: 'Installed presets cannot be deleted (disable instead)' }, corsHeaders);
        }

        const info = db.prepare('DELETE FROM agents WHERE id = ?').run(id);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);
        sseBroadcast({ type: 'agents.changed', payload: {} });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      // Legacy endpoint (v1): upsert basic fields for a list of agents.
      if (req.method === 'PUT' && url.pathname === '/agents') {
        const body = await readJson(req);
        if (!Array.isArray(body)) return sendJson(res, 400, { error: 'Expected JSON array' }, corsHeaders);

        const upsert = db.prepare(
          `INSERT INTO agents(id, display_name, emoji, openclaw_agent_id, enabled, role)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             display_name = excluded.display_name,
             emoji = excluded.emoji,
             openclaw_agent_id = excluded.openclaw_agent_id,
             enabled = excluded.enabled,
             role = excluded.role`
        );

        db.exec('BEGIN');
        try {
          for (const row of body) {
            const id = normalizeString(row?.id) || randomUUID();
            const displayName = normalizeString(row?.display_name ?? row?.displayName);
            const emoji = normalizeString(row?.emoji) || null;
            const openclawAgentId = normalizeString(row?.openclaw_agent_id ?? row?.openclawAgentId);
            const role = normalizeString(row?.role) || null;
            const enabled = row?.enabled === false ? 0 : 1;

            if (!displayName) throw new Error('agent.display_name is required');
            if (!openclawAgentId) throw new Error('agent.openclaw_agent_id is required');

            upsert.run(id, displayName, emoji, openclawAgentId, enabled, role);
          }
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }

        const rows = db
          .prepare(
            `SELECT
              a.id, a.display_name, a.emoji, a.openclaw_agent_id, a.enabled, a.role,
              a.description, a.category, a.tags_json, a.skills_json, a.prompt_overrides_json,
              a.preset_key, a.sort_order, a.created_at, a.updated_at,
              (SELECT COUNT(*) FROM task_sessions ts WHERE ts.agent_id = a.id) as assigned_task_count,
              (SELECT MAX(ar.started_at)
                 FROM task_sessions ts
                 JOIN agent_runs ar ON ar.task_id = ts.task_id
                WHERE ts.agent_id = a.id) as last_used_at,
              (SELECT COUNT(*)
                 FROM task_sessions ts
                 JOIN agent_runs ar ON ar.task_id = ts.task_id
                WHERE ts.agent_id = a.id
                  AND datetime(ar.started_at) >= datetime('now','-7 day')) as run_count_7d
             FROM agents a
             ORDER BY a.enabled DESC, a.sort_order ASC, a.display_name ASC`
          )
          .all() as any[];

        sseBroadcast({ type: 'agents.changed', payload: {} });
        return sendJson(res, 200, rows.map(agentRowToDto), corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/docs/overview') {
        return sendJson(res, 200, { content: readTextFile(overviewDocPath) }, corsHeaders);
      }

      if (req.method === 'PUT' && url.pathname === '/docs/overview') {
        const body = await readJson(req);
        const content = typeof body?.content === 'string' ? body.content : '';
        writeTextFile(overviewDocPath, content);
        sseBroadcast({ type: 'docs.changed', payload: { scope: 'overview' } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      const boardDocsGet = req.method === 'GET' ? url.pathname.match(/^\/docs\/boards\/([^/]+)$/) : null;
      if (boardDocsGet) {
        const boardId = decodeURIComponent(boardDocsGet[1]);
        return sendJson(res, 200, { content: readTextFile(boardDocPath(boardId)) }, corsHeaders);
      }

      const boardDocsPut = req.method === 'PUT' ? url.pathname.match(/^\/docs\/boards\/([^/]+)$/) : null;
      if (boardDocsPut) {
        const boardId = decodeURIComponent(boardDocsPut[1]);
        const body = await readJson(req);
        const content = typeof body?.content === 'string' ? body.content : '';
        writeTextFile(boardDocPath(boardId), content);
        sseBroadcast({ type: 'docs.changed', payload: { boardId } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      const boardChangelogGet = req.method === 'GET' ? url.pathname.match(/^\/docs\/boards\/([^/]+)\/changelog$/) : null;
      if (boardChangelogGet) {
        const boardId = decodeURIComponent(boardChangelogGet[1]);
        return sendJson(res, 200, { content: readTextFile(boardChangelogPath(boardId)) }, corsHeaders);
      }

      const boardSummaryPost = req.method === 'POST' ? url.pathname.match(/^\/docs\/boards\/([^/]+)\/summary$/) : null;
      if (boardSummaryPost) {
        const boardId = decodeURIComponent(boardSummaryPost[1]);
        const body = await readJson(req);
        const title = typeof body?.title === 'string' ? body.title.trim() : 'Untitled';
        const summary = typeof body?.summary === 'string' ? body.summary.trim() : '';
        if (!summary) return sendJson(res, 400, { error: 'summary is required' }, corsHeaders);
        appendBoardSummary({ boardId, title, summary });
        sseBroadcast({ type: 'docs.changed', payload: { boardId } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/boards') {
        const boards = db
          .prepare(
            'SELECT id, workspace_id, name, description, position, created_at, updated_at FROM boards ORDER BY position ASC, created_at ASC'
          )
          .all();
        return sendJson(res, 200, boards, corsHeaders);
      }

      if (req.method === 'POST' && url.pathname === '/boards') {
        const body = await readJson(req);
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        const description = typeof body?.description === 'string' ? body.description : null;
        let workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : null;
        if (!workspaceId) workspaceId = getDefaultWorkspaceId(db);
        if (!workspaceId) return sendJson(res, 400, { error: 'Missing workspaceId (and no workspace exists)' }, corsHeaders);
        if (!name) return sendJson(res, 400, { error: 'name is required' }, corsHeaders);

        const id = randomUUID();
        db.prepare(
          'INSERT INTO boards(id, workspace_id, name, description, position) VALUES (?, ?, ?, ?, ?)'
        ).run(id, workspaceId, name, description, body?.position ?? 0);

        sseBroadcast({ type: 'boards.changed', payload: { boardId: id, workspaceId } });

        const board = rowOrNull<any>(
          db.prepare(
            'SELECT id, workspace_id, name, description, position, created_at, updated_at FROM boards WHERE id = ?'
          ).all(id) as any
        );
        return sendJson(res, 201, board, corsHeaders);
      }

      const patchBoardMatch = req.method === 'PATCH' ? url.pathname.match(/^\/boards\/([^/]+)$/) : null;
      if (patchBoardMatch) {
        const id = decodeURIComponent(patchBoardMatch[1]);
        const body = await readJson(req);
        const updates: string[] = [];
        const params: any[] = [];

        if (body?.name !== undefined) {
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (!name) return sendJson(res, 400, { error: 'name must be a non-empty string' }, corsHeaders);
          updates.push('name = ?');
          params.push(name);
        }
        if (body?.description !== undefined) {
          const description = body.description === null ? null : typeof body.description === 'string' ? body.description : undefined;
          if (description === undefined) return sendJson(res, 400, { error: 'description must be a string or null' }, corsHeaders);
          updates.push('description = ?');
          params.push(description);
        }
        if (body?.position !== undefined) {
          const position = Number(body.position);
          if (!Number.isFinite(position)) return sendJson(res, 400, { error: 'position must be a number' }, corsHeaders);
          updates.push('position = ?');
          params.push(position);
        }

        if (!updates.length) {
          return sendJson(res, 400, { error: 'No valid fields to update (name/description/position)' }, corsHeaders);
        }

        params.push(id);
        const info = db.prepare(`UPDATE boards SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Board not found' }, corsHeaders);

        sseBroadcast({ type: 'boards.changed', payload: { boardId: id } });

        const board = rowOrNull<any>(
          db.prepare(
            'SELECT id, workspace_id, name, description, position, created_at, updated_at FROM boards WHERE id = ?'
          ).all(id) as any
        );
        return sendJson(res, 200, board, corsHeaders);
      }

      const deleteBoardMatch = req.method === 'DELETE' ? url.pathname.match(/^\/boards\/([^/]+)$/) : null;
      if (deleteBoardMatch) {
        const id = decodeURIComponent(deleteBoardMatch[1]);
        const info = db.prepare('DELETE FROM boards WHERE id = ?').run(id);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Board not found' }, corsHeaders);
        sseBroadcast({ type: 'boards.changed', payload: { boardId: id } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
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

      if (req.method === 'POST' && url.pathname === '/tasks/reorder') {
        const body = await readJson(req);
        const boardId = typeof body?.boardId === 'string' ? body.boardId : null;
        const orderedIds = Array.isArray(body?.orderedIds) ? body.orderedIds.map((id: any) => String(id)) : [];
        if (!boardId) return sendJson(res, 400, { error: 'boardId is required' }, corsHeaders);
        if (orderedIds.length === 0) return sendJson(res, 400, { error: 'orderedIds must be a non-empty array' }, corsHeaders);

        db.exec('BEGIN');
        try {
          const upd = db.prepare('UPDATE tasks SET position = ? WHERE id = ? AND board_id = ?');
          orderedIds.forEach((id: string, idx: number) => {
            upd.run(idx, id, boardId);
          });
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }

        sseBroadcast({ type: 'tasks.changed', payload: { boardId } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      if (req.method === 'POST' && url.pathname === '/tasks') {
        const body = await readJson(req);
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        const description = typeof body?.description === 'string' ? body.description : null;
        const status = typeof body?.status === 'string' ? body.status : 'ideas';
        let boardId = typeof body?.boardId === 'string' ? body.boardId : null;
        if (!boardId) boardId = getDefaultBoardId(db);
        if (!boardId) return sendJson(res, 400, { error: 'Missing boardId (and no default board exists)' }, corsHeaders);

        if (!title) return sendJson(res, 400, { error: 'title is required' }, corsHeaders);
        if (!TASK_STATUSES.has(status)) {
          return sendJson(res, 400, { error: 'Invalid status' }, corsHeaders);
        }

        const id = randomUUID();
        db.prepare('INSERT INTO tasks(id, board_id, title, description, status, position) VALUES (?, ?, ?, ?, ?, ?)').run(
          id,
          boardId,
          title,
          description,
          status,
          Number.isFinite(Number(body?.position)) ? Number(body.position) : 0
        );

        sseBroadcast({ type: 'tasks.changed', payload: { boardId, taskId: id } });

        const task = rowOrNull<any>(
          db.prepare(
            'SELECT id, board_id, title, description, status, position, due_at, created_at, updated_at FROM tasks WHERE id = ?'
          ).all(id) as any
        );
        return sendJson(res, 201, task, corsHeaders);
      }

      const taskSessionGet = req.method === 'GET' ? url.pathname.match(/^\/tasks\/([^/]+)\/session$/) : null;
      if (taskSessionGet) {
        const taskId = decodeURIComponent(taskSessionGet[1]);
        const row = rowOrNull<any>(
          db
            .prepare(
              `SELECT s.task_id, s.agent_id, s.session_key, s.status, s.last_run_id, s.created_at, s.updated_at,
                      a.display_name as agent_display_name, a.openclaw_agent_id as agent_openclaw_id
               FROM task_sessions s
               LEFT JOIN agents a ON a.id = s.agent_id
               WHERE s.task_id = ?`
            )
            .all(taskId) as any
        );
        if (!row) return sendJson(res, 404, { error: 'Task session not found' }, corsHeaders);
        return sendJson(res, 200, row, corsHeaders);
      }

      const taskSessionPost = req.method === 'POST' ? url.pathname.match(/^\/tasks\/([^/]+)\/session$/) : null;
      if (taskSessionPost) {
        const taskId = decodeURIComponent(taskSessionPost[1]);
        const body = await readJson(req);
        const agentId = typeof body?.agentId === 'string' ? body.agentId : null;

        const task = rowOrNull<{ id: string }>(db.prepare('SELECT id FROM tasks WHERE id = ?').all(taskId) as any);
        if (!task) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);

        if (agentId && !getAgentRowById(agentId)) {
          return sendJson(res, 400, { error: 'Invalid agentId' }, corsHeaders);
        }

        ensureTaskSession(taskId, agentId);
        const row = rowOrNull<any>(
          db
            .prepare(
              `SELECT s.task_id, s.agent_id, s.session_key, s.status, s.last_run_id, s.created_at, s.updated_at,
                      a.display_name as agent_display_name, a.openclaw_agent_id as agent_openclaw_id
               FROM task_sessions s
               LEFT JOIN agents a ON a.id = s.agent_id
               WHERE s.task_id = ?`
            )
            .all(taskId) as any
        );
        sseBroadcast({ type: 'task.session.changed', payload: { taskId } });
        return sendJson(res, 200, row, corsHeaders);
      }

      const taskRunMatch = req.method === 'POST' ? url.pathname.match(/^\/tasks\/([^/]+)\/run$/) : null;
      if (taskRunMatch) {
        const taskId = decodeURIComponent(taskRunMatch[1]);
        const body = await readJson(req);
        const mode = typeof body?.mode === 'string' ? body.mode : 'execute';
        if (!['plan', 'execute', 'report'].includes(mode)) {
          return sendJson(res, 400, { error: 'mode must be one of: plan, execute, report' }, corsHeaders);
        }
        const agentId = typeof body?.agentId === 'string' ? body.agentId : null;
        try {
          const result = await runTask({ taskId, mode: mode as any, agentId });
          return sendJson(res, 200, result, corsHeaders);
        } catch (err: any) {
          return sendJson(res, 500, { error: String(err?.message ?? err) }, corsHeaders);
        }
      }

      const checklistGet = req.method === 'GET' ? url.pathname.match(/^\/tasks\/([^/]+)\/checklist$/) : null;
      if (checklistGet) {
        const taskId = decodeURIComponent(checklistGet[1]);
        const rows = db
          .prepare(
            'SELECT id, task_id, title, state, position, created_at, updated_at FROM task_checklist_items WHERE task_id = ? ORDER BY position ASC, created_at ASC'
          )
          .all(taskId) as any[];
        return sendJson(res, 200, rows, corsHeaders);
      }

      const checklistPost = req.method === 'POST' ? url.pathname.match(/^\/tasks\/([^/]+)\/checklist$/) : null;
      if (checklistPost) {
        const taskId = decodeURIComponent(checklistPost[1]);
        const body = await readJson(req);
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        const state = typeof body?.state === 'string' ? body.state : 'todo';
        if (!title) return sendJson(res, 400, { error: 'title is required' }, corsHeaders);
        if (!CHECKLIST_STATES.has(state)) return sendJson(res, 400, { error: 'Invalid state' }, corsHeaders);

        const pos = Number.isFinite(Number(body?.position)) ? Number(body.position) : Date.now();
        const id = randomUUID();
        db.prepare(
          'INSERT INTO task_checklist_items(id, task_id, title, state, position) VALUES (?, ?, ?, ?, ?)'
        ).run(id, taskId, title, state, pos);
        sseBroadcast({ type: 'task.checklist.changed', payload: { taskId } });
        const row = rowOrNull<any>(
          db
            .prepare(
              'SELECT id, task_id, title, state, position, created_at, updated_at FROM task_checklist_items WHERE id = ?'
            )
            .all(id) as any
        );
        return sendJson(res, 201, row, corsHeaders);
      }

      const checklistPatch = req.method === 'PATCH' ? url.pathname.match(/^\/tasks\/([^/]+)\/checklist\/([^/]+)$/) : null;
      if (checklistPatch) {
        const taskId = decodeURIComponent(checklistPatch[1]);
        const itemId = decodeURIComponent(checklistPatch[2]);
        const body = await readJson(req);
        const updates: string[] = [];
        const params: any[] = [];

        if (body?.title !== undefined) {
          const title = typeof body.title === 'string' ? body.title.trim() : '';
          if (!title) return sendJson(res, 400, { error: 'title must be non-empty string' }, corsHeaders);
          updates.push('title = ?');
          params.push(title);
        }
        if (body?.state !== undefined) {
          const state = typeof body.state === 'string' ? body.state : '';
          if (!CHECKLIST_STATES.has(state)) return sendJson(res, 400, { error: 'Invalid state' }, corsHeaders);
          updates.push('state = ?');
          params.push(state);
        }
        if (body?.position !== undefined) {
          const position = Number(body.position);
          if (!Number.isFinite(position)) return sendJson(res, 400, { error: 'position must be a number' }, corsHeaders);
          updates.push('position = ?');
          params.push(position);
        }

        if (!updates.length) return sendJson(res, 400, { error: 'No valid fields to update' }, corsHeaders);

        params.push(itemId, taskId);
        const info = db
          .prepare(`UPDATE task_checklist_items SET ${updates.join(', ')} WHERE id = ? AND task_id = ?`)
          .run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Checklist item not found' }, corsHeaders);

        sseBroadcast({ type: 'task.checklist.changed', payload: { taskId } });
        const row = rowOrNull<any>(
          db
            .prepare(
              'SELECT id, task_id, title, state, position, created_at, updated_at FROM task_checklist_items WHERE id = ?'
            )
            .all(itemId) as any
        );
        return sendJson(res, 200, row, corsHeaders);
      }

      const checklistDelete = req.method === 'DELETE' ? url.pathname.match(/^\/tasks\/([^/]+)\/checklist\/([^/]+)$/) : null;
      if (checklistDelete) {
        const taskId = decodeURIComponent(checklistDelete[1]);
        const itemId = decodeURIComponent(checklistDelete[2]);
        const info = db.prepare('DELETE FROM task_checklist_items WHERE id = ? AND task_id = ?').run(itemId, taskId);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Checklist item not found' }, corsHeaders);
        sseBroadcast({ type: 'task.checklist.changed', payload: { taskId } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      const chatGet = req.method === 'GET' ? url.pathname.match(/^\/tasks\/([^/]+)\/chat$/) : null;
      if (chatGet) {
        const taskId = decodeURIComponent(chatGet[1]);
        const rows = db
          .prepare(
            'SELECT id, task_id, role, content, created_at FROM task_messages WHERE task_id = ? ORDER BY created_at ASC'
          )
          .all(taskId) as any[];
        return sendJson(res, 200, rows, corsHeaders);
      }

      const chatPost = req.method === 'POST' ? url.pathname.match(/^\/tasks\/([^/]+)\/chat$/) : null;
      if (chatPost) {
        const taskId = decodeURIComponent(chatPost[1]);
        const body = await readJson(req);
        const text = typeof body?.text === 'string' ? body.text.trim() : '';
        const agentId = typeof body?.agentId === 'string' ? body.agentId : null;
        if (!text) return sendJson(res, 400, { error: 'text is required' }, corsHeaders);

        const task = getTaskMeta(taskId);
        if (!task) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);

        const session = ensureTaskSession(taskId, agentId);
        const agentRow = session?.agent_id ? getAgentRowById(session.agent_id) : getDefaultAgentRow();
        const agentOpenClawId = (agentRow?.openclaw_agent_id ?? defaultAgentId) || null;

        const userMsgId = randomUUID();
        db.prepare('INSERT INTO task_messages(id, task_id, role, content) VALUES (?, ?, ?, ?)').run(
          userMsgId,
          taskId,
          'user',
          text
        );

        let reply = '';
        try {
          const result = await callOpenResponses({
            sessionKey: session?.session_key ?? taskId,
            agentOpenClawId,
            text,
          });
          reply = result.text;
        } catch (err: any) {
          reply = `OpenResponses error: ${String(err?.message ?? err)}`;
        }

        const assistantMsgId = randomUUID();
        db.prepare('INSERT INTO task_messages(id, task_id, role, content) VALUES (?, ?, ?, ?)').run(
          assistantMsgId,
          taskId,
          'assistant',
          reply
        );

        sseBroadcast({ type: 'task.chat.changed', payload: { taskId } });
        return sendJson(res, 200, { reply }, corsHeaders);
      }

      const requestApprovalMatch = req.method === 'POST'
        ? url.pathname.match(/^\/tasks\/([^/]+)\/request-approval$/)
        : null;
      if (requestApprovalMatch) {
        const taskId = decodeURIComponent(requestApprovalMatch[1]);
        const body = await readJson(req);

        const taskRow = rowOrNull<{ id: string; board_id: string; workspace_id: string; title: string }>(
          db.prepare(
            `SELECT t.id as id, t.board_id as board_id, b.workspace_id as workspace_id, t.title as title
             FROM tasks t
             JOIN boards b ON b.id = t.board_id
             WHERE t.id = ?`
          ).all(taskId) as any
        );
        if (!taskRow) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);

        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        const requestTitle = title || `Approval requested for: ${taskRow.title}`;
        const requestBody = typeof body?.body === 'string' ? body.body : null;
        const stepId = typeof body?.stepId === 'string' ? body.stepId : null;

        // Find latest run for task; if none, create a placeholder run.
        let runId = rowOrNull<{ id: string }>(
          db
            .prepare('SELECT id FROM agent_runs WHERE task_id = ? ORDER BY created_at DESC LIMIT 1')
            .all(taskId) as any
        )?.id;

        db.exec('BEGIN');
        try {
          if (!runId) {
            runId = randomUUID();
            db.prepare(
              'INSERT INTO agent_runs(id, workspace_id, board_id, task_id, agent_name, status) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(runId, taskRow.workspace_id, taskRow.board_id, taskRow.id, 'user', 'running');
          }

          const approvalId = randomUUID();
          db.prepare(
            'INSERT INTO approvals(id, run_id, step_id, status, request_title, request_body) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(approvalId, runId, stepId, 'pending', requestTitle, requestBody);

          sseBroadcast({ type: 'approvals.changed', payload: { approvalId, status: 'pending', taskId: taskId, boardId: taskRow.board_id } });

          db.exec('COMMIT');

          const row = rowOrNull<any>(
            db
              .prepare(
                `SELECT
                   a.id,
                   a.run_id,
                   a.step_id,
                   a.status,
                   a.request_title,
                   a.request_body,
                   a.requested_at,
                   a.decided_at,
                   a.decided_by,
                   a.decision_reason,
                   a.created_at,
                   a.updated_at,
                   r.task_id as task_id,
                   r.board_id as board_id,
                   t.title as task_title
                 FROM approvals a
                 JOIN agent_runs r ON r.id = a.run_id
                 LEFT JOIN tasks t ON t.id = r.task_id
                 WHERE a.id = ?`
              )
              .all(approvalId) as any
          );
          return sendJson(res, 201, row, corsHeaders);
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
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

        sseBroadcast({ type: 'runs.changed', payload: { runId, taskId } });
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

      const deleteTaskMatch = req.method === 'DELETE' ? url.pathname.match(/^\/tasks\/([^/]+)$/) : null;
      if (deleteTaskMatch) {
        const id = decodeURIComponent(deleteTaskMatch[1]);
        const meta = rowOrNull<{ board_id: string }>(
          db.prepare('SELECT board_id FROM tasks WHERE id = ?').all(id) as any
        );
        const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);
        sseBroadcast({ type: 'tasks.changed', payload: { taskId: id, boardId: meta?.board_id ?? null } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      const patchMatch = req.method === 'PATCH' ? url.pathname.match(/^\/tasks\/([^/]+)$/) : null;
      if (patchMatch) {
        const id = patchMatch[1];
        const body = await readJson(req);
        const existing = rowOrNull<{ status: string; board_id: string; title: string; description: string | null }>(
          db
            .prepare('SELECT status, board_id, title, description FROM tasks WHERE id = ?')
            .all(id) as any
        );
        if (!existing) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);

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
          if (!TASK_STATUSES.has(status)) {
            return sendJson(res, 400, { error: 'Invalid status' }, corsHeaders);
          }
          updates.push('status = ?');
          params.push(status);
        }

        if (body?.position !== undefined) {
          const position = Number(body.position);
          if (!Number.isFinite(position)) return sendJson(res, 400, { error: 'position must be a number' }, corsHeaders);
          updates.push('position = ?');
          params.push(position);
        }

        if (updates.length === 0) {
          return sendJson(res, 400, { error: 'No valid fields to update (status/title/description/position)' }, corsHeaders);
        }

        params.push(id);
        const info = db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);

        const task = rowOrNull<any>(
          db.prepare(
            'SELECT id, board_id, title, description, status, position, due_at, created_at, updated_at FROM tasks WHERE id = ?'
          ).all(id) as any
        );

        sseBroadcast({ type: 'tasks.changed', payload: { taskId: id, boardId: task?.board_id ?? null } });

        if (body?.status === 'doing' && existing.status !== 'doing') {
          runTask({ taskId: id, mode: 'execute' }).catch((err) => {
            console.error('[dzzenos-api] auto-run failed', err);
          });
        }

        if (body?.status === 'done' && existing.status !== 'done') {
          try {
            const summary = await generateTaskSummary({
              taskTitle: task?.title ?? existing.title,
              taskDescription: task?.description ?? existing.description,
              sessionKey: id,
              agentOpenClawId: null,
            });
            appendBoardSummary({ boardId: task?.board_id ?? existing.board_id, title: task?.title ?? existing.title, summary });
            sseBroadcast({ type: 'docs.changed', payload: { boardId: task?.board_id ?? existing.board_id } });
          } catch (err) {
            console.error('[dzzenos-api] done summary failed', err);
          }
        }
        return sendJson(res, 200, task, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/') {
        return sendText(res, 200, 'DzzenOS API: try GET /boards', corsHeaders);
      }

      return sendJson(res, 404, { error: 'Not found' }, corsHeaders);
    } catch (err: any) {
      if (err instanceof HttpError) {
        return sendJson(res, err.status, { error: err.message }, corsHeaders);
      }
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
