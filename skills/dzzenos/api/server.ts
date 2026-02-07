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
 *   POST  /tasks/:id/stop          (soft cancel active run)
 *   GET   /tasks/:id/runs          (runs + steps)
 *
 * Usage:
 *   node --experimental-strip-types skills/dzzenos/api/server.ts
 *   node --experimental-strip-types skills/dzzenos/api/server.ts --port 8787 --db /absolute/path/dzzenos.db
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

type SseClient = {
  id: string;
  res: http.ServerResponse;
};

import { migrate } from '../db/migrate.ts';
import {
  getDefaultWorkspaceDir,
  getLegacyRepoDbPath,
  getLegacyRepoWorkspaceDir,
  resolveDbPath,
} from '../db/paths.ts';
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
import {
  OpenClawGatewayError,
  createOpenClawGatewayClient,
  normalizeModelsOverview,
  redactSecrets,
  sanitizeProviderUpsertInput,
  type ProviderUpsertInput,
} from './openclaw-gateway.ts';

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

function parseBusyTimeoutMs(raw: string | undefined): number {
  const n = Number(raw ?? '');
  if (!Number.isFinite(n) || n < 0) return 5000;
  return Math.floor(n);
}

function parseSynchronousMode(raw: string | undefined): 'OFF' | 'NORMAL' | 'FULL' {
  const v = String(raw ?? '').trim().toUpperCase();
  if (v === 'OFF' || v === 'NORMAL' || v === 'FULL') return v;
  return 'NORMAL';
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? '');
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function parsePageLimit(
  raw: string | null,
  fallback: number,
  max: number,
  fieldName = 'limit'
): number {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new HttpError(400, `${fieldName} must be a positive integer`);
  }
  return Math.min(Math.floor(n), max);
}

function parseBeforeIsoCursor(raw: string | null, fieldName: string): string | null {
  if (raw == null) return null;
  const v = String(raw).trim();
  if (!v) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) {
    throw new HttpError(400, `${fieldName} must be a valid ISO date/time`);
  }
  return new Date(t).toISOString();
}

type RetentionConfig = {
  taskMessagesPerTask: number;
  runsPerTask: number;
  runsMaxAgeDays: number;
  cleanupIntervalSeconds: number;
};

type AllowedOrigins = {
  origins: Set<string>;
  hosts: Set<string>;
  hostPorts: Set<string>;
};

type ReasoningLevel = 'auto' | 'off' | 'low' | 'medium' | 'high';
type HeartbeatMode = 'isolated' | 'main';
type BoardAgentSubAgent = {
  key: string;
  label: string;
  agent_id: string | null;
  openclaw_agent_id: string | null;
  role_prompt: string | null;
  model: string | null;
  enabled: boolean;
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

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

function isJsonContentType(raw: string): boolean {
  const ct = raw.split(';')[0]?.trim().toLowerCase();
  if (!ct) return false;
  if (ct === 'application/json') return true;
  return ct.startsWith('application/') && ct.endsWith('+json');
}

async function readBodyText(req: http.IncomingMessage, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new HttpError(413, `Request body too large (max ${maxBytes} bytes)`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const maxBytesRaw = Number(process.env.DZZENOS_MAX_BODY_BYTES ?? '');
  const maxBytes = Number.isFinite(maxBytesRaw) && maxBytesRaw > 0 ? maxBytesRaw : DEFAULT_MAX_BODY_BYTES;

  const raw = (await readBodyText(req, maxBytes)).trim();
  if (!raw) return {};

  const ct = String(req.headers['content-type'] ?? '');
  if (!isJsonContentType(ct)) {
    throw new HttpError(415, 'Expected Content-Type: application/json');
  }

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

function nowIso(): string {
  return new Date().toISOString();
}

function parseIsoDate(raw: any): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function addMinutes(input: Date, minutes: number): Date {
  return new Date(input.getTime() + Math.max(0, minutes) * 60_000);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toUtcDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function normalizeUtcTime(value: any): string {
  const raw = normalizeString(value) || '23:30';
  const m = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(raw);
  if (!m) return '23:30';
  return `${pad2(Number(m[1]))}:${m[2]}`;
}

function computeNextStandupUtc(input: { now: Date; timeUtc: string }): Date {
  const safeTime = normalizeUtcTime(input.timeUtc);
  const [hRaw, mRaw] = safeTime.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  const todayTarget = new Date(Date.UTC(
    input.now.getUTCFullYear(),
    input.now.getUTCMonth(),
    input.now.getUTCDate(),
    h,
    m,
    0,
    0
  ));
  if (todayTarget.getTime() > input.now.getTime()) return todayTarget;
  return addMinutes(todayTarget, 24 * 60);
}

function normalizeHeartbeatMode(value: any): HeartbeatMode {
  return normalizeString(value) === 'main' ? 'main' : 'isolated';
}

function normalizeIntervalMinutes(value: any, fallback = 15): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(24 * 60, Math.max(1, Math.round(n)));
}

function normalizeOffsetMinutes(value: any): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const out = Math.round(n);
  return Math.max(0, Math.min(24 * 60 - 1, out));
}

function computeNextHeartbeatAt(input: {
  now: Date;
  intervalMinutes: number;
  offsetMinutes: number;
}): Date {
  const intervalMs = Math.max(1, input.intervalMinutes) * 60_000;
  const offsetMs = Math.max(0, input.offsetMinutes) * 60_000;
  const epoch = input.now.getTime();
  const bucket = Math.floor((epoch - offsetMs) / intervalMs) + 1;
  return new Date(bucket * intervalMs + offsetMs);
}

function slugifyLabel(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseMentions(text: string): string[] {
  const out = new Set<string>();
  const re = /(^|[\s(])@([a-zA-Z0-9._-]{2,64})/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text)) != null) {
    const token = m[2]?.trim().toLowerCase();
    if (token) out.add(token);
  }
  return [...out];
}

function parseSpaceSeparatedArgs(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/).filter(Boolean);
}

function pickCronJobId(raw: any): string | null {
  const candidates = [
    raw?.id,
    raw?.jobId,
    raw?.job?.id,
    raw?.result?.id,
    raw?.data?.id,
    raw?.job?.jobId,
  ];
  for (const c of candidates) {
    const s = normalizeString(c);
    if (s) return s;
  }
  return null;
}

function pickCronNextRunAt(raw: any): string | null {
  const candidates = [
    raw?.nextRunAt,
    raw?.next_run_at,
    raw?.job?.nextRunAt,
    raw?.job?.next_run_at,
    raw?.result?.nextRunAt,
    raw?.result?.next_run_at,
  ];
  for (const c of candidates) {
    const d = parseIsoDate(c);
    if (d) return d.toISOString();
  }
  return null;
}

const TASK_STATUSES = new Set(['ideas', 'todo', 'doing', 'review', 'release', 'done', 'archived']);
const CHECKLIST_STATES = new Set(['todo', 'doing', 'done']);
const REASONING_LEVELS = new Set<ReasoningLevel>(['auto', 'off', 'low', 'medium', 'high']);
const DEFAULT_PROJECT_STATUSES: Array<{ key: string; label: string; position: number }> = [
  { key: 'ideas', label: 'Ideas', position: 0 },
  { key: 'todo', label: 'To do', position: 1 },
  { key: 'doing', label: 'In progress', position: 2 },
  { key: 'review', label: 'Review', position: 3 },
  { key: 'release', label: 'Release', position: 4 },
  { key: 'done', label: 'Done', position: 5 },
  { key: 'archived', label: 'Archived', position: 6 },
];
const DEFAULT_PROJECT_SECTIONS: Array<{
  name: string;
  description: string;
  viewMode: 'kanban' | 'threads';
  kind: 'inbox' | 'section';
  position: number;
}> = [
  { name: 'Inbox', description: 'Project intake', viewMode: 'kanban', kind: 'inbox', position: 0 },
  { name: 'Product', description: 'Product delivery and roadmap', viewMode: 'kanban', kind: 'section', position: 1 },
  { name: 'Marketing', description: 'Growth, experiments and distribution', viewMode: 'threads', kind: 'section', position: 2 },
  { name: 'Content', description: 'Content pipeline and assets', viewMode: 'threads', kind: 'section', position: 3 },
  { name: 'Ops', description: 'Operations and admin tasks', viewMode: 'kanban', kind: 'section', position: 4 },
];

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function moveLegacyWorkspaceIfNeeded(workspaceDir: string, legacyWorkspaceDir: string) {
  if (workspaceDir === legacyWorkspaceDir) return;
  if (fs.existsSync(workspaceDir)) return;
  if (!fs.existsSync(legacyWorkspaceDir)) return;

  ensureDir(path.dirname(workspaceDir));
  try {
    fs.renameSync(legacyWorkspaceDir, workspaceDir);
  } catch (err: any) {
    if (err?.code !== 'EXDEV') throw err;
    fs.cpSync(legacyWorkspaceDir, workspaceDir, { recursive: true });
    fs.rmSync(legacyWorkspaceDir, { recursive: true, force: true });
  }
  console.log(`[dzzenos-api] moved legacy workspace dir from ${legacyWorkspaceDir} to ${workspaceDir}`);
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

  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO workspaces(id, name, description) VALUES (?, ?, ?)').run(
      workspaceId,
      'Default Project',
      'Seeded on first run'
    );
    const insSection = db.prepare(
      'INSERT INTO boards(id, workspace_id, name, description, position, view_mode, section_kind) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const section of DEFAULT_PROJECT_SECTIONS) {
      insSection.run(
        randomUUID(),
        workspaceId,
        section.name,
        section.description,
        section.position,
        section.viewMode,
        section.kind
      );
    }

    const insStatus = db.prepare(
      'INSERT INTO project_statuses(id, workspace_id, status_key, label, position) VALUES (?, ?, ?, ?, ?)'
    );
    for (const status of DEFAULT_PROJECT_STATUSES) {
      insStatus.run(randomUUID(), workspaceId, status.key, status.label, status.position);
    }
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

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, 'Invalid URL encoding');
  }
}

function requireUuid(value: string, label: string): string {
  const v = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    throw new HttpError(400, `${label} must be a UUID`);
  }
  return v;
}

function asObject(value: any): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getRequestAuthorizationHeader(req: http.IncomingMessage): string {
  const raw = req.headers.authorization;
  return typeof raw === 'string' ? raw.trim() : '';
}

function isGatewayFallbackError(err: unknown): boolean {
  if (!(err instanceof OpenClawGatewayError)) return false;
  if (err.status === 400 || err.status === 404 || err.status === 405 || err.status === 501) return true;
  const msg = String(err.message ?? '').toLowerCase();
  return msg.includes('method not found') || msg.includes('unsupported') || msg.includes('not implemented');
}

function gatewayErrorToHttp(err: unknown): { status: number; message: string } {
  if (err instanceof OpenClawGatewayError) {
    const status = Number.isFinite(err.status) ? Math.min(599, Math.max(400, err.status)) : 502;
    return { status, message: err.message || 'OpenClaw gateway error' };
  }
  return { status: 502, message: String((err as any)?.message ?? err ?? 'OpenClaw gateway error') };
}

type ProvidersContainer =
  | { path: 'providers'; providers: Record<string, unknown> }
  | { path: 'model_providers'; providers: Record<string, unknown> }
  | { path: 'models.providers'; providers: Record<string, unknown> };

function resolveProvidersContainer(config: Record<string, unknown>): ProvidersContainer {
  const rootProviders = asObject(config.providers);
  if (rootProviders) return { path: 'providers', providers: { ...rootProviders } };

  const modelProviders = asObject((config as any).model_providers);
  if (modelProviders) return { path: 'model_providers', providers: { ...modelProviders } };

  const models = asObject((config as any).models);
  const nestedProviders = asObject(models?.providers);
  if (nestedProviders) return { path: 'models.providers', providers: { ...nestedProviders } };

  return { path: 'providers', providers: {} };
}

function buildProvidersPatch(container: ProvidersContainer, providers: Record<string, unknown>): Record<string, unknown> {
  if (container.path === 'providers') return { providers };
  if (container.path === 'model_providers') return { model_providers: providers };
  return { models: { providers } };
}

function buildProviderConfigEntry(input: ProviderUpsertInput, previousRaw: unknown): Record<string, unknown> {
  const previous = asObject(previousRaw) ?? {};
  const next: Record<string, unknown> = { ...previous };

  next.enabled = input.enabled;
  next.auth_mode = input.auth_mode;

  // Preserve existing schema conventions where possible.
  if ('type' in next || !('kind' in next)) next.type = input.kind;
  if ('kind' in next || !('type' in next)) next.kind = input.kind;

  if (input.api_base_url) {
    if ('base_url' in next || !('api_base_url' in next)) next.base_url = input.api_base_url;
    next.api_base_url = input.api_base_url;
  }

  if (input.auth_mode === 'api_key' && input.api_key) {
    const authObj = asObject((next as any).auth);
    if (authObj) {
      next.auth = { ...authObj, mode: 'api_key', api_key: input.api_key };
    } else {
      next.api_key = input.api_key;
    }
  }

  if (input.auth_mode === 'oauth') {
    const authObj = asObject((next as any).auth) ?? {};
    next.auth = { ...authObj, mode: 'oauth' };
    if (input.oauth) {
      const existingOAuth = asObject((next as any).oauth) ?? {};
      next.oauth = { ...existingOAuth, ...input.oauth };
    }
  }

  if (input.options) {
    const existingOptions = asObject((next as any).options) ?? {};
    next.options = { ...existingOptions, ...input.options };
  }

  return next;
}

async function upsertProviderViaConfig(gateway: any, input: ProviderUpsertInput): Promise<void> {
  const config = await gateway.configGet();
  const container = resolveProvidersContainer(config);
  const nextProviders: Record<string, unknown> = { ...container.providers };
  nextProviders[input.id] = buildProviderConfigEntry(input, nextProviders[input.id]);

  const patch = buildProvidersPatch(container, nextProviders);
  await gateway.configPatch(patch);
  await gateway.configApply();
}

async function deleteProviderViaConfig(gateway: any, providerId: string): Promise<boolean> {
  const config = await gateway.configGet();
  const container = resolveProvidersContainer(config);
  if (!(providerId in container.providers)) return false;

  const nextProviders: Record<string, unknown> = { ...container.providers };
  delete nextProviders[providerId];
  const patch = buildProvidersPatch(container, nextProviders);

  await gateway.configPatch(patch);
  await gateway.configApply();
  return true;
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

function parseJsonObject(raw: any): Record<string, any> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as any;
  if (typeof raw !== 'string') return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as any;
    return {};
  } catch {
    return {};
  }
}

function parseSubAgentsJson(raw: any): BoardAgentSubAgent[] {
  const src = (() => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'string') return [];
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const out: BoardAgentSubAgent[] = [];
  const seen = new Set<string>();
  for (const row of src) {
    if (!row || typeof row !== 'object') continue;
    const keyRaw = normalizeString((row as any).key);
    if (!keyRaw) continue;
    const key = keyRaw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const label = normalizeString((row as any).label) || key;
    const agentId = normalizeString((row as any).agent_id) || normalizeString((row as any).agentId) || null;
    const openclawAgentId =
      normalizeString((row as any).openclaw_agent_id) || normalizeString((row as any).openclawAgentId) || null;
    const rolePrompt = normalizeString((row as any).role_prompt) || normalizeString((row as any).rolePrompt) || null;
    const model = normalizeString((row as any).model) || null;
    const enabled = (row as any).enabled !== false;

    out.push({
      key,
      label,
      agent_id: agentId,
      openclaw_agent_id: openclawAgentId,
      role_prompt: rolePrompt,
      model,
      enabled,
    });
  }
  return out;
}

function jsonStringifySubAgents(value: BoardAgentSubAgent[]): string {
  const out = parseSubAgentsJson(value);
  return JSON.stringify(out);
}

function parseJsonRecord(raw: any, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // noop
  }
  return fallback;
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
    workspace_id: r.workspace_id ?? null,
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

function boardAgentSettingsRowToDto(r: any) {
  return {
    board_id: String(r.board_id),
    preferred_agent_id: r.preferred_agent_id ?? null,
    skills: parseStringArrayJson(r.skills_json),
    prompt_overrides: parsePromptOverridesJson(r.prompt_overrides_json),
    policy: parseJsonObject(r.policy_json),
    memory_path: r.memory_path ?? null,
    auto_delegate: Boolean(r.auto_delegate),
    sub_agents: parseSubAgentsJson(r.sub_agents_json),
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
    preferred_agent_display_name: r.preferred_agent_display_name ?? null,
    preferred_agent_openclaw_id: r.preferred_agent_openclaw_id ?? null,
  };
}

function workspaceAgentSettingsRowToDto(r: any) {
  return {
    workspace_id: String(r.workspace_id),
    preferred_agent_id: r.preferred_agent_id ?? null,
    skills: parseStringArrayJson(r.skills_json),
    prompt_overrides: parsePromptOverridesJson(r.prompt_overrides_json),
    policy: parseJsonObject(r.policy_json),
    memory_path: r.memory_path ?? null,
    auto_delegate: Boolean(r.auto_delegate),
    sub_agents: parseSubAgentsJson(r.sub_agents_json),
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
    preferred_agent_display_name: r.preferred_agent_display_name ?? null,
    preferred_agent_openclaw_id: r.preferred_agent_openclaw_id ?? null,
  };
}

function getDefaultProjectId(db: DatabaseSync): string | null {
  const row = rowOrNull<{ id: string }>(
    db
      .prepare(
        `SELECT id
           FROM workspaces
          WHERE COALESCE(is_archived, 0) = 0
          ORDER BY position ASC, created_at ASC
          LIMIT 1`
      )
      .all() as any
  );
  return row?.id ?? null;
}

function getDefaultSectionId(db: DatabaseSync, projectId?: string | null): string | null {
  if (projectId) {
    const row = rowOrNull<{ id: string }>(
      db
        .prepare(
          `SELECT id
             FROM boards
            WHERE workspace_id = ?
            ORDER BY CASE WHEN section_kind = 'inbox' THEN 0 ELSE 1 END ASC, position ASC, created_at ASC
            LIMIT 1`
        )
        .all(projectId) as any
    );
    return row?.id ?? null;
  }

  const row = rowOrNull<{ id: string }>(
    db
      .prepare(
        `SELECT id
           FROM boards
          ORDER BY CASE WHEN section_kind = 'inbox' THEN 0 ELSE 1 END ASC, position ASC, created_at ASC
          LIMIT 1`
      )
      .all() as any
  );
  return row?.id ?? null;
}

function getWorkspaceIdByBoardId(db: DatabaseSync, boardId: string): string | null {
  const row = rowOrNull<{ workspace_id: string }>(
    db.prepare('SELECT workspace_id FROM boards WHERE id = ?').all(boardId) as any
  );
  return row?.workspace_id ?? null;
}

function getProjectInboxSectionId(db: DatabaseSync, projectId: string): string | null {
  const row = rowOrNull<{ id: string }>(
    db
      .prepare(
        `SELECT id
           FROM boards
          WHERE workspace_id = ?
            AND (section_kind = 'inbox' OR lower(name) = 'inbox')
          ORDER BY position ASC, created_at ASC
          LIMIT 1`
      )
      .all(projectId) as any
  );
  return row?.id ?? null;
}

// Legacy aliases kept for internal migration compatibility.
function getDefaultBoardId(db: DatabaseSync): string | null {
  return getDefaultSectionId(db);
}

function getDefaultWorkspaceId(db: DatabaseSync): string | null {
  return getDefaultProjectId(db);
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
  const workspaceDir = path.resolve(process.env.DZZENOS_WORKSPACE_DIR ?? getDefaultWorkspaceDir());
  if (!process.env.DZZENOS_WORKSPACE_DIR) {
    moveLegacyWorkspaceIfNeeded(workspaceDir, getLegacyRepoWorkspaceDir(repoRoot));
  }

  const docsDir = path.join(workspaceDir, 'docs');
  const memoryDir = path.join(workspaceDir, 'memory');
  const overviewDocPath = path.join(docsDir, 'overview.md');

  const openResponsesUrl =
    process.env.OPENRESPONSES_URL ?? process.env.DZZENOS_OPENRESPONSES_URL ?? '';
  const openResponsesToken =
    process.env.OPENRESPONSES_TOKEN ?? process.env.DZZENOS_OPENRESPONSES_TOKEN ?? '';
  const openResponsesModel =
    process.env.OPENRESPONSES_MODEL ?? process.env.DZZENOS_OPENRESPONSES_MODEL ?? 'openclaw:main';
  const gatewayBaseUrl =
    process.env.DZZENOS_GATEWAY_URL ??
    process.env.OPENCLAW_GATEWAY_URL ??
    `http://127.0.0.1:${process.env.GATEWAY_PORT ?? 18789}`;
  const gatewayToken =
    process.env.DZZENOS_GATEWAY_TOKEN ??
    process.env.OPENCLAW_GATEWAY_TOKEN ??
    process.env.GATEWAY_TOKEN ??
    '';
  const gatewayTimeoutMsRaw = Number(process.env.DZZENOS_GATEWAY_TIMEOUT_MS ?? '');
  const gatewayTimeoutMs = Number.isFinite(gatewayTimeoutMsRaw) && gatewayTimeoutMsRaw > 0 ? gatewayTimeoutMsRaw : 15_000;
  const defaultAgentId = process.env.DZZENOS_DEFAULT_AGENT_ID ?? '';
  const taskAbortControllers = new Map<string, AbortController>();
  const openClawBin = normalizeString(process.env.DZZENOS_OPENCLAW_BIN) || 'openclaw';
  const openClawBaseArgs = parseSpaceSeparatedArgs(process.env.DZZENOS_OPENCLAW_ARGS ?? '');

  function runOpenClawCliJson(args: string[]) {
    const cmdArgs = [...openClawBaseArgs, ...args];
    try {
      const stdout = execFileSync(openClawBin, cmdArgs, {
        encoding: 'utf8',
        env: process.env,
        maxBuffer: 8 * 1024 * 1024,
      });
      const text = String(stdout ?? '').trim();
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Invalid OpenClaw JSON output: ${text.slice(0, 400)}`);
      }
    } catch (err: any) {
      const stderr = String(err?.stderr ?? '').trim();
      const stdout = String(err?.stdout ?? '').trim();
      const reason = stderr || stdout || String(err?.message ?? err);
      if (String(reason).includes('command not found') || err?.code === 'ENOENT') {
        throw new Error(
          `OpenClaw CLI not found. Set DZZENOS_OPENCLAW_BIN or install openclaw. (${openClawBin})`
        );
      }
      throw new Error(`OpenClaw CLI error: ${reason}`);
    }
  }

  function openClawCronStatus() {
    return runOpenClawCliJson(['cron', 'status', '--json']);
  }

  function openClawCronList(input?: { includeDisabled?: boolean }) {
    const args = ['cron', 'list', '--json'];
    if (input?.includeDisabled) args.push('--all');
    const raw = runOpenClawCliJson(args);
    const jobs = Array.isArray((raw as any)?.jobs) ? (raw as any).jobs : [];
    return { raw, jobs };
  }

  function openClawCronRuns(jobId: string, limit = 50) {
    return runOpenClawCliJson(['cron', 'runs', '--id', jobId, '--limit', String(Math.max(1, limit))]);
  }

  function openClawCronRun(jobId: string, mode: 'force' | 'due' = 'force') {
    const args = ['cron', 'run', jobId];
    if (mode === 'due') args.push('--due');
    return runOpenClawCliJson(args);
  }

  function openClawCronRemove(jobId: string) {
    return runOpenClawCliJson(['cron', 'rm', jobId, '--json']);
  }

  function openClawCronAddHeartbeat(input: {
    name: string;
    everyMinutes: number;
    mode: HeartbeatMode;
    message: string;
    agentOpenClawId?: string | null;
    model?: string | null;
    enabled: boolean;
  }) {
    const args = [
      'cron',
      'add',
      '--name',
      input.name,
      '--every',
      `${Math.max(1, input.everyMinutes)}m`,
      '--session',
      input.mode,
      '--wake',
      'now',
      '--json',
    ];
    if (!input.enabled) args.push('--disabled');
    if (input.agentOpenClawId) args.push('--agent', input.agentOpenClawId);
    if (input.mode === 'main') {
      args.push('--system-event', input.message || 'Heartbeat check');
    } else {
      args.push('--message', input.message || 'Heartbeat check');
      args.push('--no-deliver');
      if (input.model) args.push('--model', input.model);
    }
    return runOpenClawCliJson(args);
  }

  function openClawCronEditHeartbeat(input: {
    jobId: string;
    everyMinutes: number;
    mode: HeartbeatMode;
    message: string;
    agentOpenClawId?: string | null;
    model?: string | null;
    enabled: boolean;
  }) {
    const args = [
      'cron',
      'edit',
      input.jobId,
      '--session',
      input.mode,
      '--every',
      `${Math.max(1, input.everyMinutes)}m`,
    ];
    if (input.enabled) args.push('--enable');
    else args.push('--disable');
    if (input.agentOpenClawId) args.push('--agent', input.agentOpenClawId);
    else args.push('--clear-agent');
    if (input.mode === 'main') {
      args.push('--system-event', input.message || 'Heartbeat check');
    } else {
      args.push('--message', input.message || 'Heartbeat check');
      args.push('--no-deliver');
      if (input.model) args.push('--model', input.model);
    }
    return runOpenClawCliJson(args);
  }

  function openClawCronAddStandup(input: {
    name: string;
    hourUtc: number;
    minuteUtc: number;
    message: string;
    agentOpenClawId?: string | null;
    model?: string | null;
    enabled: boolean;
  }) {
    const expr = `${Math.max(0, Math.min(59, input.minuteUtc))} ${Math.max(0, Math.min(23, input.hourUtc))} * * *`;
    const args = [
      'cron',
      'add',
      '--name',
      input.name,
      '--cron',
      expr,
      '--tz',
      'UTC',
      '--session',
      'isolated',
      '--message',
      input.message,
      '--no-deliver',
      '--wake',
      'now',
      '--json',
    ];
    if (!input.enabled) args.push('--disabled');
    if (input.agentOpenClawId) args.push('--agent', input.agentOpenClawId);
    if (input.model) args.push('--model', input.model);
    return runOpenClawCliJson(args);
  }

  function openClawCronEditStandup(input: {
    jobId: string;
    hourUtc: number;
    minuteUtc: number;
    message: string;
    agentOpenClawId?: string | null;
    model?: string | null;
    enabled: boolean;
  }) {
    const expr = `${Math.max(0, Math.min(59, input.minuteUtc))} ${Math.max(0, Math.min(23, input.hourUtc))} * * *`;
    const args = [
      'cron',
      'edit',
      input.jobId,
      '--cron',
      expr,
      '--tz',
      'UTC',
      '--session',
      'isolated',
      '--message',
      input.message,
      '--no-deliver',
    ];
    if (input.enabled) args.push('--enable');
    else args.push('--disable');
    if (input.agentOpenClawId) args.push('--agent', input.agentOpenClawId);
    else args.push('--clear-agent');
    if (input.model) args.push('--model', input.model);
    return runOpenClawCliJson(args);
  }

  function makeGatewayClient(req: http.IncomingMessage) {
    return createOpenClawGatewayClient({
      baseUrl: gatewayBaseUrl,
      token: gatewayToken || undefined,
      authorizationHeader: gatewayToken ? undefined : getRequestAuthorizationHeader(req),
      timeoutMs: gatewayTimeoutMs,
    });
  }

  function sectionDocPath(sectionId: string) {
    return path.join(docsDir, 'sections', `${sectionId}.md`);
  }

  function sectionChangelogPath(sectionId: string) {
    return path.join(docsDir, 'sections', sectionId, 'changelog.md');
  }

  function sectionMemoryPath(sectionId: string) {
    return path.join(memoryDir, 'sections', `${sectionId}.md`);
  }

  function scopeMemoryPath(scope: string, scopeId: string) {
    if (scope === 'overview') return path.join(memoryDir, 'overview.md');
    if (scope === 'project') return path.join(memoryDir, 'projects', `${scopeId}.md`);
    if (scope === 'section') return path.join(memoryDir, 'sections', `${scopeId}.md`);
    if (scope === 'agent') return path.join(memoryDir, 'agents', `${scopeId}.md`);
    if (scope === 'task') return path.join(memoryDir, 'tasks', `${scopeId}.md`);
    return path.join(memoryDir, `${scope}-${scopeId}.md`);
  }

  // Legacy aliases for internal compatibility.
  function boardDocPath(boardId: string) {
    return sectionDocPath(boardId);
  }

  function boardChangelogPath(boardId: string) {
    return sectionChangelogPath(boardId);
  }

  function boardMemoryPath(boardId: string) {
    return sectionMemoryPath(boardId);
  }

  async function callOpenResponses(input: {
    sessionKey: string;
    text: string;
    agentOpenClawId?: string | null;
    model?: string | null;
    signal?: AbortSignal;
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
      body: JSON.stringify({ model: input.model ?? openResponsesModel, input: input.text }),
      signal: input.signal,
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

  function appendSectionSummary(params: { sectionId: string; title: string; summary: string }) {
    const ts = new Date().toISOString();
    const entryHeader = `## ${params.title}\n\n`;
    const entryBody = `${params.summary}\n\n`;
    const changeEntry = `- ${ts} — ${params.title}\n${params.summary}\n\n`;

    appendTextFile(sectionDocPath(params.sectionId), entryHeader + entryBody);
    appendTextFile(sectionChangelogPath(params.sectionId), changeEntry);
    appendTextFile(sectionMemoryPath(params.sectionId), changeEntry);
  }

  const args = parseArgs(process.argv.slice(2));

  const migrationsDir = path.resolve(
    args.migrationsDir ?? path.join(repoRoot, 'skills/dzzenos/db/migrations')
  );
  const resolvedDb = resolveDbPath(args.dbPath);
  const dbPath = resolvedDb.dbPath;

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

  migrate({
    dbPath,
    migrationsDir,
    legacyDbPath: resolvedDb.source === 'default' ? getLegacyRepoDbPath(repoRoot) : undefined,
  });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`PRAGMA busy_timeout = ${parseBusyTimeoutMs(process.env.DZZENOS_SQLITE_BUSY_TIMEOUT_MS)};`);
  db.exec(`PRAGMA synchronous = ${parseSynchronousMode(process.env.DZZENOS_SQLITE_SYNCHRONOUS)};`);
  db.exec('PRAGMA temp_store = MEMORY;');

  seedIfEmpty(db);

  const retention: RetentionConfig = {
    taskMessagesPerTask: parseNonNegativeInt(process.env.DZZENOS_RETENTION_TASK_MESSAGES_PER_TASK, 2000),
    runsPerTask: parseNonNegativeInt(process.env.DZZENOS_RETENTION_RUNS_PER_TASK, 300),
    runsMaxAgeDays: parseNonNegativeInt(process.env.DZZENOS_RETENTION_RUNS_MAX_AGE_DAYS, 90),
    cleanupIntervalSeconds: parseNonNegativeInt(process.env.DZZENOS_RETENTION_CLEANUP_INTERVAL_SECONDS, 900),
  };

  function trimTaskMessagesByTask(taskId: string, keep: number): number {
    if (keep <= 0) return 0;
    const info = db
      .prepare(
        `DELETE FROM task_messages
         WHERE id IN (
           SELECT id
           FROM task_messages
           WHERE task_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT -1 OFFSET ?
         )`
      )
      .run(taskId, keep) as any;
    return Number(info?.changes ?? 0);
  }

  function trimTaskMessagesGlobal(keep: number): number {
    if (keep <= 0) return 0;
    const info = db
      .prepare(
        `WITH ranked AS (
           SELECT id,
                  row_number() OVER (PARTITION BY task_id ORDER BY created_at DESC, id DESC) AS rn
           FROM task_messages
         )
         DELETE FROM task_messages
         WHERE id IN (SELECT id FROM ranked WHERE rn > ?)`
      )
      .run(keep) as any;
    return Number(info?.changes ?? 0);
  }

  function trimRunsByTask(taskId: string, keep: number): number {
    if (keep <= 0) return 0;
    const info = db
      .prepare(
        `DELETE FROM agent_runs
         WHERE id IN (
           SELECT id
           FROM agent_runs
           WHERE task_id = ? AND status <> 'running'
           ORDER BY created_at DESC, id DESC
           LIMIT -1 OFFSET ?
         )`
      )
      .run(taskId, keep) as any;
    return Number(info?.changes ?? 0);
  }

  function trimRunsGlobal(keep: number): number {
    if (keep <= 0) return 0;
    const info = db
      .prepare(
        `WITH ranked AS (
           SELECT id,
                  row_number() OVER (PARTITION BY task_id ORDER BY created_at DESC, id DESC) AS rn
           FROM agent_runs
           WHERE task_id IS NOT NULL AND status <> 'running'
         )
         DELETE FROM agent_runs
         WHERE id IN (SELECT id FROM ranked WHERE rn > ?)`
      )
      .run(keep) as any;
    return Number(info?.changes ?? 0);
  }

  function trimRunsByAge(days: number, taskId?: string): number {
    if (days <= 0) return 0;
    if (taskId) {
      const info = db
        .prepare(
          `DELETE FROM agent_runs
           WHERE task_id = ?
             AND status <> 'running'
             AND julianday(created_at) < julianday('now') - ?`
        )
        .run(taskId, days) as any;
      return Number(info?.changes ?? 0);
    }
    const info = db
      .prepare(
        `DELETE FROM agent_runs
         WHERE status <> 'running'
           AND julianday(created_at) < julianday('now') - ?`
      )
      .run(days) as any;
    return Number(info?.changes ?? 0);
  }

  function runRetentionCleanup(scope?: { taskId?: string }): { removedMessages: number; removedRuns: number } {
    const taskId = scope?.taskId ?? null;
    let removedMessages = 0;
    let removedRuns = 0;

    if (retention.taskMessagesPerTask > 0) {
      removedMessages += taskId
        ? trimTaskMessagesByTask(taskId, retention.taskMessagesPerTask)
        : trimTaskMessagesGlobal(retention.taskMessagesPerTask);
    }
    if (retention.runsPerTask > 0) {
      removedRuns += taskId
        ? trimRunsByTask(taskId, retention.runsPerTask)
        : trimRunsGlobal(retention.runsPerTask);
    }
    if (retention.runsMaxAgeDays > 0) {
      removedRuns += trimRunsByAge(retention.runsMaxAgeDays, taskId ?? undefined);
    }

    if (removedMessages > 0 || removedRuns > 0) {
      const tag = taskId ? `task=${taskId}` : 'global';
      console.log(
        `[dzzenos-api] retention cleanup (${tag}): removed_messages=${removedMessages}, removed_runs=${removedRuns}`
      );
    }

    return { removedMessages, removedRuns };
  }

  try {
    runRetentionCleanup();
  } catch (err) {
    console.error('[dzzenos-api] retention startup cleanup failed', err);
  }

  if (retention.cleanupIntervalSeconds > 0) {
    const timer = setInterval(() => {
      try {
        runRetentionCleanup();
      } catch (err) {
        console.error('[dzzenos-api] retention periodic cleanup failed', err);
      }
    }, retention.cleanupIntervalSeconds * 1000);
    timer.unref?.();
  }

  function getTaskMeta(taskId: string) {
    return rowOrNull<{
      id: string;
      section_id: string;
      board_id: string;
      project_id: string;
      workspace_id: string;
      title: string;
      description: string | null;
      status: string;
    }>(
      db.prepare(
        `SELECT t.id as id,
                t.board_id as section_id,
                t.board_id as board_id,
                COALESCE(t.workspace_id, b.workspace_id) as project_id,
                COALESCE(t.workspace_id, b.workspace_id) as workspace_id,
                t.title as title, t.description as description, t.status as status
         FROM tasks t
         JOIN boards b ON b.id = t.board_id
         WHERE t.id = ?`
      ).all(taskId) as any
    );
  }

  function getBoardMeta(boardId: string) {
    return rowOrNull<{
      id: string;
      workspace_id: string;
      name: string;
      description: string | null;
    }>(
      db
        .prepare('SELECT id, workspace_id, name, description FROM boards WHERE id = ?')
        .all(boardId) as any
    );
  }

  function getWorkspaceMeta(workspaceId: string) {
    return rowOrNull<{
      id: string;
      name: string;
      description: string | null;
    }>(
      db
        .prepare('SELECT id, name, description FROM workspaces WHERE id = ?')
        .all(workspaceId) as any
    );
  }

  function getBoardAgentSettingsRow(boardId: string) {
    return rowOrNull<any>(
      db
        .prepare(
          `SELECT
             s.board_id, s.preferred_agent_id, s.skills_json, s.prompt_overrides_json,
             s.policy_json, s.memory_path, s.auto_delegate, s.sub_agents_json,
             s.created_at, s.updated_at,
             a.display_name as preferred_agent_display_name,
             a.openclaw_agent_id as preferred_agent_openclaw_id
           FROM board_agent_settings s
           LEFT JOIN agents a ON a.id = s.preferred_agent_id
           WHERE s.board_id = ?`
        )
        .all(boardId) as any
    );
  }

  function getWorkspaceAgentSettingsRow(workspaceId: string) {
    return rowOrNull<{
      workspace_id: string;
      preferred_agent_id: string | null;
      skills_json: string;
      prompt_overrides_json: string;
      policy_json: string;
      memory_path: string | null;
      auto_delegate: number;
      sub_agents_json: string;
      created_at: string | null;
      updated_at: string | null;
      preferred_agent_display_name: string | null;
      preferred_agent_openclaw_id: string | null;
    }>(
      db
        .prepare(
          `SELECT
             s.workspace_id, s.preferred_agent_id, s.skills_json, s.prompt_overrides_json,
             s.policy_json, s.memory_path, s.auto_delegate, s.sub_agents_json,
             s.created_at, s.updated_at,
             a.display_name as preferred_agent_display_name,
             a.openclaw_agent_id as preferred_agent_openclaw_id
           FROM workspace_agent_settings s
           LEFT JOIN agents a ON a.id = s.preferred_agent_id
           WHERE s.workspace_id = ?`
        )
        .all(workspaceId) as any
    );
  }

  function getAgentRowById(agentId: string, workspaceId?: string | null) {
    return rowOrNull<{
      id: string;
      workspace_id: string | null;
      display_name: string;
      openclaw_agent_id: string;
      skills_json: string;
      prompt_overrides_json: string;
    }>(
      db
        .prepare(
          `SELECT id, workspace_id, display_name, openclaw_agent_id, skills_json, prompt_overrides_json
           FROM agents
           WHERE id = ?
             AND enabled = 1
             AND (? IS NULL OR workspace_id = ?)`
        )
        .all(agentId, workspaceId ?? null, workspaceId ?? null) as any
    );
  }

  function getDefaultAgentRow(workspaceId?: string | null) {
    const scopeWorkspaceId = workspaceId ?? getDefaultWorkspaceId(db);
    if (scopeWorkspaceId && defaultAgentId) {
      const row = rowOrNull<{
        id: string;
        workspace_id: string | null;
        display_name: string;
        openclaw_agent_id: string;
        skills_json: string;
        prompt_overrides_json: string;
      }>(
        db
          .prepare(
            `SELECT id, workspace_id, display_name, openclaw_agent_id, skills_json, prompt_overrides_json
             FROM agents
             WHERE openclaw_agent_id = ?
               AND enabled = 1
               AND workspace_id = ?
             ORDER BY sort_order ASC, created_at ASC
             LIMIT 1`
          )
          .all(defaultAgentId, scopeWorkspaceId) as any
      );
      if (row) return row;
    }
    if (scopeWorkspaceId) {
      const row = rowOrNull<{
        id: string;
        workspace_id: string | null;
        display_name: string;
        openclaw_agent_id: string;
        skills_json: string;
        prompt_overrides_json: string;
      }>(
        db
          .prepare(
            `SELECT id, workspace_id, display_name, openclaw_agent_id, skills_json, prompt_overrides_json
             FROM agents
             WHERE enabled = 1
               AND workspace_id = ?
             ORDER BY sort_order ASC, created_at ASC
             LIMIT 1`
          )
          .all(scopeWorkspaceId) as any
      );
      if (row) return row;
    }
    return rowOrNull<{
      id: string;
      workspace_id: string | null;
      display_name: string;
      openclaw_agent_id: string;
      skills_json: string;
      prompt_overrides_json: string;
    }>(
      db
        .prepare(
          `SELECT id, workspace_id, display_name, openclaw_agent_id, skills_json, prompt_overrides_json
           FROM agents
           WHERE enabled = 1
           ORDER BY sort_order ASC, created_at ASC
           LIMIT 1`
        )
        .all() as any
    );
  }

  function resolveAgentWorkspaceId(input: { workspaceId?: string | null; boardId?: string | null }) {
    const workspaceId = normalizeString(input.workspaceId ?? '');
    if (workspaceId) return workspaceId;
    const boardId = normalizeString(input.boardId ?? '');
    if (boardId) {
      const byBoard = getWorkspaceIdByBoardId(db, boardId);
      if (!byBoard) throw new HttpError(404, 'Board not found');
      return byBoard;
    }
    return getDefaultWorkspaceId(db);
  }

  function getAgentSubagents(parentAgentId: string) {
    const rows = db
      .prepare(
        `SELECT
           s.id,
           s.parent_agent_id,
           s.child_agent_id,
           s.role,
           s.trigger_rules_json,
           s.max_calls,
           s.sort_order,
           s.created_at,
           s.updated_at,
           a.display_name as child_display_name,
           a.openclaw_agent_id as child_openclaw_agent_id
         FROM agent_subagents s
         JOIN agents a ON a.id = s.child_agent_id
        WHERE s.parent_agent_id = ?
        ORDER BY s.sort_order ASC, s.created_at ASC`
      )
      .all(parentAgentId) as any[];
    return rows.map((r) => ({
      id: String(r.id),
      parent_agent_id: String(r.parent_agent_id),
      child_agent_id: String(r.child_agent_id),
      role: typeof r.role === 'string' ? r.role : '',
      trigger_rules_json: parseJsonRecord(r.trigger_rules_json),
      max_calls: Number.isFinite(Number(r.max_calls)) ? Number(r.max_calls) : 3,
      order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 0,
      sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 0,
      created_at: String(r.created_at ?? ''),
      updated_at: String(r.updated_at ?? ''),
      child_display_name: String(r.child_display_name ?? ''),
      child_openclaw_agent_id: String(r.child_openclaw_agent_id ?? ''),
    }));
  }

  function getOrchestrationPolicy(agentId: string) {
    db.prepare(
      `INSERT OR IGNORE INTO agent_orchestration_policies(
        agent_id, mode, delegation_budget_json, escalation_rules_json
      ) VALUES (?, 'openclaw', '{"max_total_calls":8,"max_parallel":2}', '{}')`
    ).run(agentId);

    const row = rowOrNull<any>(
      db
        .prepare(
          `SELECT agent_id, mode, delegation_budget_json, escalation_rules_json, created_at, updated_at
             FROM agent_orchestration_policies
            WHERE agent_id = ?`
        )
        .all(agentId) as any
    );
    if (!row) return null;
    return {
      agent_id: String(row.agent_id),
      mode: String(row.mode ?? 'openclaw'),
      delegation_budget_json: parseJsonRecord(row.delegation_budget_json),
      escalation_rules_json: parseJsonRecord(row.escalation_rules_json),
      created_at: String(row.created_at ?? ''),
      updated_at: String(row.updated_at ?? ''),
    };
  }

  function createArtifact(runId: string, stepId: string, kind: string, uri: string, meta?: Record<string, unknown>) {
    db.prepare(
      `INSERT INTO artifacts(id, run_id, step_id, kind, uri, mime_type, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      runId,
      stepId,
      kind,
      uri,
      'application/json',
      meta ? JSON.stringify(meta) : null
    );
  }

  function memoryScopeFallback(scope: string, scopeId: string) {
    if (scope === 'overview') return readTextFile(overviewDocPath);
    if (scope === 'section') {
      const fromDb = readTextFile(sectionMemoryPath(scopeId));
      if (fromDb.trim()) return fromDb;
      return readTextFile(sectionDocPath(scopeId));
    }
    return readTextFile(scopeMemoryPath(scope, scopeId));
  }

  function getMemoryDoc(scope: string, scopeId: string) {
    const row = rowOrNull<any>(
      db
        .prepare(
          `SELECT id, scope, scope_id, content, updated_by, created_at, updated_at
             FROM memory_docs
            WHERE scope = ? AND scope_id = ?`
        )
        .all(scope, scopeId) as any
    );
    if (row) {
      return {
        id: String(row.id),
        scope: String(row.scope),
        scope_id: String(row.scope_id),
        content: String(row.content ?? ''),
        updated_by: row.updated_by == null ? null : String(row.updated_by),
        created_at: String(row.created_at ?? ''),
        updated_at: String(row.updated_at ?? ''),
      };
    }
    const content = memoryScopeFallback(scope, scopeId);
    return {
      id: null,
      scope,
      scope_id: scopeId,
      content,
      updated_by: null,
      created_at: null,
      updated_at: null,
    };
  }

  function upsertMemoryDoc(scope: string, scopeId: string, content: string, updatedBy: string | null) {
    db.prepare(
      `INSERT INTO memory_docs(id, scope, scope_id, content, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(scope, scope_id)
       DO UPDATE SET
         content = excluded.content,
         updated_by = excluded.updated_by`
    ).run(randomUUID(), scope, scopeId, content, updatedBy);

    if (scope === 'overview') {
      writeTextFile(overviewDocPath, content);
    } else if (scope === 'section') {
      writeTextFile(sectionMemoryPath(scopeId), content);
      writeTextFile(sectionDocPath(scopeId), content);
    } else {
      writeTextFile(scopeMemoryPath(scope, scopeId), content);
    }
  }

  function ensureTaskSession(
    task: { id: string; board_id: string; workspace_id: string },
    opts?: { agentId?: string | null; reasoningLevel?: ReasoningLevel | null }
  ) {
    const taskId = task.id;
    const existing = rowOrNull<{
      task_id: string;
      agent_id: string | null;
      session_key: string;
      reasoning_level: ReasoningLevel | null;
    }>(
      db
        .prepare('SELECT task_id, agent_id, session_key, reasoning_level FROM task_sessions WHERE task_id = ?')
        .all(taskId) as any
    );
    if (existing) {
      let shouldRefresh = false;
      if (opts && Object.prototype.hasOwnProperty.call(opts, 'agentId')) {
        const nextAgentId = opts.agentId ?? null;
        if (existing.agent_id !== nextAgentId) {
          db.prepare('UPDATE task_sessions SET agent_id = ? WHERE task_id = ?').run(nextAgentId, taskId);
          shouldRefresh = true;
        }
      }
      if (opts && Object.prototype.hasOwnProperty.call(opts, 'reasoningLevel')) {
        const nextReasoning = opts.reasoningLevel ?? 'auto';
        if (existing.reasoning_level !== nextReasoning) {
          db.prepare('UPDATE task_sessions SET reasoning_level = ? WHERE task_id = ?').run(nextReasoning, taskId);
          shouldRefresh = true;
        }
      }
      const expectedSessionKey = `project:${task.workspace_id}:board:${task.board_id}:task:${task.id}`;
      if (existing.session_key !== expectedSessionKey) {
        db.prepare('UPDATE task_sessions SET session_key = ? WHERE task_id = ?').run(expectedSessionKey, taskId);
        shouldRefresh = true;
      }
      if (!shouldRefresh) {
        return existing;
      }
      return rowOrNull<{
        task_id: string;
        agent_id: string | null;
        session_key: string;
        reasoning_level: ReasoningLevel | null;
      }>(
        db
          .prepare('SELECT task_id, agent_id, session_key, reasoning_level FROM task_sessions WHERE task_id = ?')
          .all(taskId) as any
      );
    }

    const sessionKey = `project:${task.workspace_id}:board:${task.board_id}:task:${task.id}`;
    const reasoningLevel = opts?.reasoningLevel ?? 'auto';
    db.prepare('INSERT INTO task_sessions(task_id, agent_id, session_key, reasoning_level) VALUES (?, ?, ?, ?)').run(
      taskId,
      opts?.agentId ?? null,
      sessionKey,
      reasoningLevel
    );
    return rowOrNull<{
      task_id: string;
      agent_id: string | null;
      session_key: string;
      reasoning_level: ReasoningLevel | null;
    }>(
      db
        .prepare('SELECT task_id, agent_id, session_key, reasoning_level FROM task_sessions WHERE task_id = ?')
        .all(taskId) as any
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

  function resolveReasoning(level: ReasoningLevel | null | undefined, description?: string | null): ReasoningLevel | null {
    const safe = level ?? 'auto';
    if (safe === 'off') return null;
    if (safe === 'auto') {
      const len = (description ?? '').trim().length;
      return len >= 240 ? 'medium' : null;
    }
    return safe;
  }

  function isAbortError(err: any): boolean {
    return err?.name === 'AbortError' || String(err?.message ?? '').toLowerCase().includes('aborted');
  }

  function getResolvedBoardAgentSettings(boardId: string) {
    const row = getBoardAgentSettingsRow(boardId);
    if (row) return row;
    return {
      board_id: boardId,
      preferred_agent_id: null,
      skills_json: '[]',
      prompt_overrides_json: '{}',
      policy_json: '{}',
      memory_path: null,
      auto_delegate: 1,
      sub_agents_json: '[]',
      created_at: null,
      updated_at: null,
      preferred_agent_display_name: null,
      preferred_agent_openclaw_id: null,
    };
  }

  function getResolvedWorkspaceAgentSettings(workspaceId: string) {
    const row = getWorkspaceAgentSettingsRow(workspaceId);
    if (row) return row;
    return {
      workspace_id: workspaceId,
      preferred_agent_id: null,
      skills_json: '[]',
      prompt_overrides_json: '{}',
      policy_json: '{}',
      memory_path: null,
      auto_delegate: 1,
      sub_agents_json: '[]',
      created_at: null,
      updated_at: null,
      preferred_agent_display_name: null,
      preferred_agent_openclaw_id: null,
    };
  }

  function getAgentHeartbeatSettingsRow(agentId: string) {
    return rowOrNull<{
      agent_id: string;
      workspace_id: string;
      enabled: number;
      interval_minutes: number;
      offset_minutes: number;
      mode: HeartbeatMode;
      message: string;
      model: string | null;
      cron_job_id: string | null;
      next_run_at: string | null;
      last_run_at: string | null;
      last_error: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>(
      db
        .prepare(
          `SELECT
             agent_id, workspace_id, enabled, interval_minutes, offset_minutes, mode, message, model,
             cron_job_id, next_run_at, last_run_at, last_error, created_at, updated_at
           FROM agent_heartbeat_settings
           WHERE agent_id = ?`
        )
        .all(agentId) as any
    );
  }

  function getResolvedAgentHeartbeatSettings(input: { agentId: string; workspaceId: string }) {
    const row = getAgentHeartbeatSettingsRow(input.agentId);
    if (row) return row;
    return {
      agent_id: input.agentId,
      workspace_id: input.workspaceId,
      enabled: 1,
      interval_minutes: 15,
      offset_minutes: 0,
      mode: 'isolated' as HeartbeatMode,
      message:
        'You are on heartbeat duty. Check new mentions, assigned tasks, and recent activity. If nothing actionable, reply HEARTBEAT_OK.',
      model: null,
      cron_job_id: null,
      next_run_at: null,
      last_run_at: null,
      last_error: null,
      created_at: null,
      updated_at: null,
    };
  }

  function heartbeatSettingsToDto(row: any) {
    return {
      agent_id: String(row.agent_id),
      workspace_id: String(row.workspace_id),
      enabled: Boolean(row.enabled),
      interval_minutes: Number(row.interval_minutes ?? 15),
      offset_minutes: Number(row.offset_minutes ?? 0),
      mode: normalizeHeartbeatMode(row.mode),
      message: String(row.message ?? ''),
      model: row.model ?? null,
      cron_job_id: row.cron_job_id ?? null,
      next_run_at: row.next_run_at ?? null,
      last_run_at: row.last_run_at ?? null,
      last_error: row.last_error ?? null,
      created_at: String(row.created_at ?? ''),
      updated_at: String(row.updated_at ?? ''),
    };
  }

  function getWorkspaceStandupSettingsRow(workspaceId: string) {
    return rowOrNull<{
      workspace_id: string;
      enabled: number;
      time_utc: string;
      prompt: string | null;
      model: string | null;
      cron_job_id: string | null;
      next_run_at: string | null;
      last_run_at: string | null;
      last_error: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>(
      db
        .prepare(
          `SELECT
             workspace_id, enabled, time_utc, prompt, model, cron_job_id, next_run_at, last_run_at, last_error, created_at, updated_at
           FROM workspace_standup_settings
           WHERE workspace_id = ?`
        )
        .all(workspaceId) as any
    );
  }

  function getResolvedWorkspaceStandupSettings(workspaceId: string) {
    const row = getWorkspaceStandupSettingsRow(workspaceId);
    if (row) return row;
    return {
      workspace_id: workspaceId,
      enabled: 0,
      time_utc: '23:30',
      prompt: null,
      model: null,
      cron_job_id: null,
      next_run_at: null,
      last_run_at: null,
      last_error: null,
      created_at: null,
      updated_at: null,
    };
  }

  function standupSettingsToDto(row: any) {
    return {
      workspace_id: String(row.workspace_id),
      enabled: Boolean(row.enabled),
      time_utc: normalizeUtcTime(row.time_utc),
      prompt: row.prompt ?? null,
      model: row.model ?? null,
      cron_job_id: row.cron_job_id ?? null,
      next_run_at: row.next_run_at ?? null,
      last_run_at: row.last_run_at ?? null,
      last_error: row.last_error ?? null,
      created_at: String(row.created_at ?? ''),
      updated_at: String(row.updated_at ?? ''),
    };
  }

  function syncHeartbeatForAgent(agentId: string) {
    const agent = rowOrNull<{
      id: string;
      workspace_id: string | null;
      openclaw_agent_id: string;
      display_name: string;
    }>(
      db
        .prepare(
          `SELECT id, workspace_id, openclaw_agent_id, display_name
           FROM agents
           WHERE id = ?`
        )
        .all(agentId) as any
    );
    if (!agent) throw new Error('Agent not found');
    if (!agent.workspace_id) throw new Error('Agent has no workspace');

    const row = getResolvedAgentHeartbeatSettings({
      agentId: agent.id,
      workspaceId: agent.workspace_id,
    });
    const mode = normalizeHeartbeatMode(row.mode);
    const enabled = Boolean(row.enabled);
    const everyMinutes = normalizeIntervalMinutes(row.interval_minutes, 15);
    const message =
      normalizeString(row.message) ||
      'You are on heartbeat duty. Check new mentions, assigned tasks, and recent activity. If nothing actionable, reply HEARTBEAT_OK.';
    const model = normalizeString(row.model) || null;
    const name = `dzzen-heartbeat:${slugifyLabel(agent.openclaw_agent_id || agent.display_name || agent.id) || agent.id}`;

    let cronJobId = normalizeString(row.cron_job_id) || null;
    let cronRaw: any = null;

    if (!cronJobId) {
      cronRaw = openClawCronAddHeartbeat({
        name,
        everyMinutes,
        mode,
        message,
        agentOpenClawId: agent.openclaw_agent_id,
        model,
        enabled,
      });
      cronJobId = pickCronJobId(cronRaw);
      if (!cronJobId) {
        throw new Error(`Failed to resolve heartbeat cron job id from OpenClaw response: ${JSON.stringify(cronRaw)}`);
      }
    } else {
      cronRaw = openClawCronEditHeartbeat({
        jobId: cronJobId,
        everyMinutes,
        mode,
        message,
        agentOpenClawId: agent.openclaw_agent_id,
        model,
        enabled,
      });
    }

    const nextRunAt = pickCronNextRunAt(cronRaw);

    db.prepare(
      `UPDATE agent_heartbeat_settings
       SET cron_job_id = ?, next_run_at = ?, last_run_at = ?, last_error = NULL
       WHERE agent_id = ?`
    ).run(cronJobId, nextRunAt, nowIso(), agentId);

    const refreshed = getResolvedAgentHeartbeatSettings({ agentId, workspaceId: agent.workspace_id });
    return {
      settings: refreshed,
      cron_raw: cronRaw,
    };
  }

  function buildStandupPrompt(input: {
    workspaceName: string;
    workspaceDescription?: string | null;
    customPrompt?: string | null;
  }): string {
    const custom = normalizeString(input.customPrompt);
    if (custom) return custom;
    return [
      `Generate DAILY STANDUP for workspace: ${input.workspaceName}.`,
      `Workspace context: ${input.workspaceDescription ?? ''}`,
      'Use sections: COMPLETED, IN_PROGRESS, BLOCKED, NEEDS_REVIEW, KEY_DECISIONS.',
      'Be concise and actionable.',
    ].join('\n');
  }

  function syncStandupForWorkspace(workspaceId: string) {
    const workspace = getWorkspaceMeta(workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    const row = getResolvedWorkspaceStandupSettings(workspaceId);
    const enabled = Boolean(row.enabled);
    const timeUtc = normalizeUtcTime(row.time_utc);
    const [hRaw, mRaw] = timeUtc.split(':');
    const hourUtc = Number(hRaw);
    const minuteUtc = Number(mRaw);
    const prompt = buildStandupPrompt({
      workspaceName: workspace.name,
      workspaceDescription: workspace.description ?? null,
      customPrompt: row.prompt ?? null,
    });
    const model = normalizeString(row.model) || null;
    const workspaceAgentSettings = getResolvedWorkspaceAgentSettings(workspaceId);
    const preferredAgent = workspaceAgentSettings.preferred_agent_id
      ? getAgentRowById(workspaceAgentSettings.preferred_agent_id, workspaceId)
      : getDefaultAgentRow(workspaceId);
    const openclawAgentId = normalizeString(preferredAgent?.openclaw_agent_id) || null;
    const name = `dzzen-standup:${slugifyLabel(workspace.name) || workspace.id}`;

    let cronJobId = normalizeString(row.cron_job_id) || null;
    let cronRaw: any = null;
    if (!cronJobId) {
      cronRaw = openClawCronAddStandup({
        name,
        hourUtc,
        minuteUtc,
        message: prompt,
        model,
        agentOpenClawId: openclawAgentId,
        enabled,
      });
      cronJobId = pickCronJobId(cronRaw);
      if (!cronJobId) {
        throw new Error(`Failed to resolve standup cron job id from OpenClaw response: ${JSON.stringify(cronRaw)}`);
      }
    } else {
      cronRaw = openClawCronEditStandup({
        jobId: cronJobId,
        hourUtc,
        minuteUtc,
        message: prompt,
        model,
        agentOpenClawId: openclawAgentId,
        enabled,
      });
    }

    const nextRunAt = pickCronNextRunAt(cronRaw);
    db.prepare(
      `UPDATE workspace_standup_settings
       SET cron_job_id = ?, next_run_at = ?, last_run_at = ?, last_error = NULL
       WHERE workspace_id = ?`
    ).run(cronJobId, nextRunAt, nowIso(), workspaceId);

    const refreshed = getResolvedWorkspaceStandupSettings(workspaceId);
    return {
      settings: refreshed,
      cron_raw: cronRaw,
    };
  }

  function resolvePromptForMode(input: {
    mode: 'plan' | 'execute' | 'report' | 'chat';
    agentPromptOverridesRaw?: any;
    workspacePromptOverridesRaw?: any;
    boardPromptOverridesRaw?: any;
  }) {
    const fallback =
      input.mode === 'plan'
        ? 'You are a task planner. Return JSON: { "description": "...", "checklist": ["..."] }.'
        : input.mode === 'execute'
          ? 'You are executing the task. Return JSON: { "status": "review" | "doing", "report": "..." }.'
          : input.mode === 'report'
            ? 'Summarize the completion for changelog. Return bullet points.'
            : 'You are helping in task chat. Be concise and actionable.';

    const agentPromptOverrides = parsePromptOverridesJson(input.agentPromptOverridesRaw);
    const workspacePromptOverrides = parsePromptOverridesJson(input.workspacePromptOverridesRaw);
    const boardPromptOverrides = parsePromptOverridesJson(input.boardPromptOverridesRaw);
    const systemPrompt =
      boardPromptOverrides.system ?? workspacePromptOverrides.system ?? agentPromptOverrides.system ?? null;
    const modePrompt =
      (boardPromptOverrides as any)[input.mode] ??
      (workspacePromptOverrides as any)[input.mode] ??
      (agentPromptOverrides as any)[input.mode] ??
      fallback;
    return { systemPrompt, modePrompt };
  }

  function resolvePreferredTaskAgent(input: {
    task: { id: string; board_id: string; workspace_id: string };
    sessionAgentId?: string | null;
    boardPreferredAgentId?: string | null;
    workspacePreferredAgentId?: string | null;
  }) {
    if (input.sessionAgentId) {
      const row = getAgentRowById(input.sessionAgentId, input.task.workspace_id);
      if (row) return row;
    }
    if (input.boardPreferredAgentId) {
      const row = getAgentRowById(input.boardPreferredAgentId, input.task.workspace_id);
      if (row) return row;
    }
    if (input.workspacePreferredAgentId) {
      const row = getAgentRowById(input.workspacePreferredAgentId, input.task.workspace_id);
      if (row) return row;
    }
    return getDefaultAgentRow(input.task.workspace_id);
  }

  async function runTask(opts: { taskId: string; mode: 'plan' | 'execute' | 'report'; agentId?: string | null }) {
    const task = getTaskMeta(opts.taskId);
    if (!task) throw new Error('Task not found');
    if (opts.agentId && !getAgentRowById(opts.agentId, task.workspace_id)) {
      throw new Error('Invalid agentId');
    }

    const workspaceSettings = getResolvedWorkspaceAgentSettings(task.workspace_id);
    const boardSettings = getResolvedBoardAgentSettings(task.board_id);
    const boardSettingsRow = getBoardAgentSettingsRow(task.board_id);
    const boardMeta = getBoardMeta(task.board_id);
    const workspaceMeta = getWorkspaceMeta(task.workspace_id);
    const session =
      opts.agentId !== undefined ? ensureTaskSession(task, { agentId: opts.agentId }) : ensureTaskSession(task);
    const agentRow = resolvePreferredTaskAgent({
      task,
      sessionAgentId: session?.agent_id ?? null,
      boardPreferredAgentId: boardSettings.preferred_agent_id ?? null,
      workspacePreferredAgentId: workspaceSettings.preferred_agent_id ?? null,
    });
    const agentOpenClawId = agentRow?.openclaw_agent_id ?? (defaultAgentId || null);
    const agentDisplayName = agentRow?.display_name ?? 'orchestrator';
    const sessionKey = session?.session_key ?? `project:${task.workspace_id}:board:${task.board_id}:task:${task.id}`;
    const { systemPrompt, modePrompt } = resolvePromptForMode({
      mode: opts.mode,
      agentPromptOverridesRaw: agentRow?.prompt_overrides_json ?? '{}',
      workspacePromptOverridesRaw: workspaceSettings.prompt_overrides_json ?? '{}',
      boardPromptOverridesRaw: boardSettings.prompt_overrides_json ?? '{}',
    });
    const workspaceSkills = parseStringArrayJson(workspaceSettings.skills_json);
    const boardSkills = parseStringArrayJson(boardSettings.skills_json);
    const agentSkills = parseStringArrayJson(agentRow?.skills_json ?? '[]');
    const effectiveSkills = [...new Set([...agentSkills, ...workspaceSkills, ...boardSkills])];
    const workspacePolicy = parseJsonObject(workspaceSettings.policy_json);
    const boardPolicy = parseJsonObject(boardSettings.policy_json);
    const effectivePolicy = { ...workspacePolicy, ...boardPolicy };
    const memoryPath =
      normalizeString(boardSettings.memory_path ?? '') || normalizeString(workspaceSettings.memory_path ?? '') || null;
    const subagents = agentRow?.id ? getAgentSubagents(agentRow.id) : [];
    const orchestrationPolicy = agentRow?.id ? getOrchestrationPolicy(agentRow.id) : null;
    const orchestrationSnapshot = {
      mode: 'openclaw',
      parent_agent_id: agentRow?.id ?? null,
      parent_agent_name: agentDisplayName,
      policy: orchestrationPolicy,
      subagents: subagents.map((s) => ({
        id: s.id,
        child_agent_id: s.child_agent_id,
        role: s.role,
        trigger_rules_json: s.trigger_rules_json,
        max_calls: s.max_calls,
      })),
      board_settings: {
        preferred_agent_id: boardSettings.preferred_agent_id ?? null,
        auto_delegate: Boolean(boardSettings.auto_delegate),
        memory_path: memoryPath,
        skills: effectiveSkills,
      },
      workspace_settings: {
        preferred_agent_id: workspaceSettings.preferred_agent_id ?? null,
        auto_delegate: Boolean(workspaceSettings.auto_delegate),
      },
    };

    db.prepare('UPDATE task_sessions SET status = ? WHERE task_id = ?').run('running', task.id);

    const runId = randomUUID();
    const stepId = randomUUID();

    const controller = new AbortController();
    taskAbortControllers.set(task.id, controller);

    db.exec('BEGIN');
    try {
      db.prepare(
        'INSERT INTO agent_runs(id, workspace_id, board_id, task_id, agent_name, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(runId, task.workspace_id, task.board_id, task.id, agentDisplayName, 'running');
      db.prepare(
        'INSERT INTO run_steps(id, run_id, step_index, kind, status, input_json, output_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(stepId, runId, 0, opts.mode, 'running', JSON.stringify({ mode: opts.mode, orchestration: orchestrationSnapshot }), null);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    let outputText = '';
    let parsed: any = null;
    let stepIndex = 1;
    const delegatedOutputs: Array<{ key: string; label: string; text: string; error?: string }> = [];
    let usageObserved = false;
    let usageInputTokens = 0;
    let usageOutputTokens = 0;
    let usageTotalTokens = 0;

    const addUsage = (usage: any) => {
      if (!usage || typeof usage !== 'object') return;
      const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? null);
      const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? null);
      const totalTokens = Number(usage.total_tokens ?? null);
      if (Number.isFinite(inputTokens)) {
        usageInputTokens += inputTokens;
        usageObserved = true;
      }
      if (Number.isFinite(outputTokens)) {
        usageOutputTokens += outputTokens;
        usageObserved = true;
      }
      if (Number.isFinite(totalTokens)) {
        usageTotalTokens += totalTokens;
        usageObserved = true;
      }
    };

    try {
      const reasoning = resolveReasoning(session?.reasoning_level ?? 'auto', task.description);
      const reasoningPrefix = reasoning ? `/think ${reasoning}` : '';

      if (opts.mode === 'execute') {
        const workspaceSubAgents = parseSubAgentsJson(workspaceSettings.sub_agents_json).filter((s) => s.enabled);
        const boardSubAgents = parseSubAgentsJson(boardSettings.sub_agents_json).filter((s) => s.enabled);
        const subAgents = boardSettingsRow ? boardSubAgents : workspaceSubAgents;
        const autoDelegate = boardSettingsRow
          ? Boolean(boardSettings.auto_delegate)
          : Boolean(workspaceSettings.auto_delegate);
        if (autoDelegate && subAgents.length) {
          for (const sub of subAgents) {
            const subStepId = randomUUID();
            db.prepare(
              'INSERT INTO run_steps(id, run_id, step_index, kind, status, input_json, output_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(
              subStepId,
              runId,
              stepIndex++,
              `delegate:${sub.key}`,
              'running',
              JSON.stringify({
                sub_agent: sub,
                board_id: task.board_id,
                task_id: task.id,
              }),
              null
            );

            const subAgentRow = sub.agent_id ? getAgentRowById(sub.agent_id, task.workspace_id) : null;
            const subAgentOpenclawId = subAgentRow?.openclaw_agent_id ?? sub.openclaw_agent_id ?? null;
            const subSessionKey = `${sessionKey}:worker:${sub.key}`;

            const delegatePromptParts: string[] = [];
            if (sub.role_prompt) delegatePromptParts.push(`Role: ${sub.role_prompt}`);
            delegatePromptParts.push(
              'You are a delegated specialist for this task. Return concise actionable output in Markdown.'
            );
            delegatePromptParts.push(`Task title: ${task.title}`);
            delegatePromptParts.push(`Task description: ${task.description ?? ''}`);
            delegatePromptParts.push(`Project context: ${workspaceMeta?.description ?? ''}`);
            delegatePromptParts.push(`Board context: ${boardMeta?.description ?? ''}`);
            if (effectiveSkills.length) delegatePromptParts.push(`Preferred skills overlay: ${effectiveSkills.join(', ')}`);
            if (memoryPath) delegatePromptParts.push(`Memory path hint: ${memoryPath}`);
            if (Object.keys(effectivePolicy).length) {
              delegatePromptParts.push(`Policy context: ${JSON.stringify(effectivePolicy)}`);
            }

            try {
              const { text: delegatedText, raw: delegatedRaw } = await callOpenResponses({
                sessionKey: subSessionKey,
                agentOpenClawId: subAgentOpenclawId,
                model: sub.model,
                text: delegatePromptParts.join('\n\n'),
                signal: controller.signal,
              });
              addUsage(delegatedRaw?.usage ?? null);
              delegatedOutputs.push({ key: sub.key, label: sub.label, text: delegatedText.trim() });
              db.prepare(
                "UPDATE run_steps SET status = 'succeeded', output_json = ?, finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?"
              ).run(
                JSON.stringify({
                  text: delegatedText,
                  usage: delegatedRaw?.usage ?? null,
                  model: sub.model ?? null,
                  openclaw_agent_id: subAgentOpenclawId,
                }),
                subStepId
              );
            } catch (err: any) {
              if (isAbortError(err)) throw err;
              const errorText = String(err?.message ?? err);
              delegatedOutputs.push({ key: sub.key, label: sub.label, text: '', error: errorText });
              db.prepare(
                "UPDATE run_steps SET status = 'failed', output_json = ?, finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?"
              ).run(
                JSON.stringify({
                  error: errorText,
                  model: sub.model ?? null,
                  openclaw_agent_id: subAgentOpenclawId,
                }),
                subStepId
              );
            }
          }
        }
      }

      const orchestrationPrompt =
        subagents.length > 0
          ? [
              'Delegation policy: OpenClaw-only orchestration. Use subagents when relevant.',
              `Budget: ${JSON.stringify(orchestrationPolicy?.delegation_budget_json ?? { max_total_calls: 8, max_parallel: 2 })}`,
              `Escalation: ${JSON.stringify(orchestrationPolicy?.escalation_rules_json ?? {})}`,
              'Available subagents:',
              ...subagents.map(
                (s, idx) =>
                  `${idx + 1}. ${s.child_display_name || s.child_agent_id} (${s.child_openclaw_agent_id}) role="${s.role}" max_calls=${s.max_calls} trigger_rules=${JSON.stringify(s.trigger_rules_json)}`
              ),
              'If delegation details are not observable in runtime output, continue safely and return final result.',
            ].join('\n')
          : 'No subagents configured. Execute directly as the main agent.';

      const inputSections: string[] = [];
      if (systemPrompt) inputSections.push(`System profile:\n${systemPrompt}`);
      if (reasoningPrefix) inputSections.push(reasoningPrefix);
      inputSections.push(modePrompt);
      inputSections.push(orchestrationPrompt);
      inputSections.push(`Task title: ${task.title}\nTask description: ${task.description ?? ''}`);
      if (effectiveSkills.length) inputSections.push(`Preferred skills overlay: ${effectiveSkills.join(', ')}`);
      if (memoryPath) inputSections.push(`Memory path hint: ${memoryPath}`);
      if (Object.keys(effectivePolicy).length) inputSections.push(`Policy context: ${JSON.stringify(effectivePolicy)}`);
      if (delegatedOutputs.length) {
        const delegationSummary = delegatedOutputs
          .map((d) => {
            if (d.error) return `### ${d.label}\nError: ${d.error}`;
            return `### ${d.label}\n${d.text}`;
          })
          .join('\n\n');
        inputSections.push(`Delegated worker outputs:\n${delegationSummary}`);
      }
      const inputText = inputSections.join('\n\n');

      const { text, raw } = await callOpenResponses({
        sessionKey,
        agentOpenClawId,
        text: inputText,
        signal: controller.signal,
      });
      addUsage(raw?.usage ?? null);

      outputText = text;
      parsed = tryParseJson(text);

      db.prepare(
        "UPDATE run_steps SET status = 'succeeded', output_json = ?, finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?"
      ).run(
        JSON.stringify({
          text: outputText,
          parsed,
          usage: raw?.usage ?? null,
          delegated_count: delegatedOutputs.length,
          delegated: delegatedOutputs,
          board_settings: {
            preferred_agent_id: boardSettings.preferred_agent_id ?? null,
            auto_delegate: Boolean(boardSettings.auto_delegate),
            memory_path: memoryPath,
            skills: effectiveSkills,
          },
          workspace_settings: {
            preferred_agent_id: workspaceSettings.preferred_agent_id ?? null,
            auto_delegate: Boolean(workspaceSettings.auto_delegate),
          },
          orchestration: orchestrationSnapshot,
        }),
        stepId
      );
      createArtifact(runId, stepId, 'orchestration.snapshot', `memory://runs/${runId}/orchestration-snapshot.json`, orchestrationSnapshot);
      const delegation = parseJsonRecord(
        parsed?.delegation_decisions,
        parseJsonRecord(parsed?.delegation, {})
      );
      createArtifact(runId, stepId, 'orchestration.decisions', `memory://runs/${runId}/delegation-decisions.json`, {
        delegation_decisions: delegation,
        delegation_observable: Object.keys(delegation).length > 0,
        note: Object.keys(delegation).length > 0 ? null : 'delegation not observable',
      });

      if (usageObserved) {
        const computedTotal = usageTotalTokens || usageInputTokens + usageOutputTokens;
        db.prepare(
          'UPDATE agent_runs SET input_tokens = ?, output_tokens = ?, total_tokens = ? WHERE id = ?'
        ).run(
          usageInputTokens > 0 ? usageInputTokens : null,
          usageOutputTokens > 0 ? usageOutputTokens : null,
          computedTotal > 0 ? computedTotal : null,
          runId
        );
      }

      db.prepare(
        "UPDATE agent_runs SET status = 'succeeded', finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?"
      ).run(runId);
    } catch (err: any) {
      if (isAbortError(err)) {
        db.prepare(
          "UPDATE run_steps SET status = 'cancelled', output_json = ?, finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE run_id = ? AND status = 'running'"
        ).run(JSON.stringify({ error: 'cancelled' }), runId);
        db.prepare(
          "UPDATE agent_runs SET status = 'cancelled', finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?"
        ).run(runId);
        return { runId, outputText: '', parsed: null, cancelled: true };
      }
      db.prepare(
        "UPDATE run_steps SET status = 'failed', output_json = ?, finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE run_id = ? AND status = 'running'"
      ).run(JSON.stringify({ error: String(err?.message ?? err) }), runId);
      db.prepare(
        "UPDATE agent_runs SET status = 'failed', finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?"
      ).run(runId);
      throw err;
    } finally {
      taskAbortControllers.delete(task.id);
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
      sseBroadcast({
        type: 'tasks.changed',
        payload: { taskId: task.id, sectionId: task.section_id, boardId: task.board_id, projectId: task.project_id, workspaceId: task.workspace_id },
      });
    }

    if (opts.mode === 'execute') {
      if (parsed?.status === 'review') {
        db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('review', task.id);
        sseBroadcast({
          type: 'tasks.changed',
          payload: { taskId: task.id, sectionId: task.section_id, boardId: task.board_id, projectId: task.project_id, workspaceId: task.workspace_id },
        });
      }
    }

    sseBroadcast({ type: 'runs.changed', payload: { runId, taskId: task.id } });
    try {
      runRetentionCleanup({ taskId: task.id });
    } catch (err) {
      console.error('[dzzenos-api] retention cleanup after run failed', err);
    }

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

function isStateChangingMethod(method: string | undefined): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function getEffectiveOrigin(req: http.IncomingMessage): string | null {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (origin) return origin;
  const referer = typeof req.headers.referer === 'string' ? req.headers.referer.trim() : '';
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = addr.startsWith('::ffff:') ? addr.slice('::ffff:'.length) : addr;
  if (a === '::1' || a === '::') return true;
  if (a === '127.0.0.1') return true;
  return a.startsWith('127.');
}

function requireAllowedOriginForStateChange(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  corsHeaders: Record<string, string>,
  allowedOrigins: AllowedOrigins
): boolean {
  if (!isStateChangingMethod(req.method)) return true;

  const origin = getEffectiveOrigin(req);
  if (origin) {
    if (!isAllowedOrigin(origin, req.headers.host as string | undefined, allowedOrigins)) {
      sendText(res, 403, 'Invalid origin', corsHeaders);
      return false;
    }
    return true;
  }

  // Browsers typically send Sec-Fetch-*; if present but no Origin/Referer, reject.
  const secFetchSite = req.headers['sec-fetch-site'];
  if (typeof secFetchSite === 'string' && secFetchSite.trim()) {
    sendText(res, 403, 'Missing origin', corsHeaders);
    return false;
  }

  // Allow originless state changes only from loopback (e.g., CLI tools on the same host).
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    sendText(res, 403, 'Missing origin', corsHeaders);
    return false;
  }

  return true;
}

const server = http.createServer(async (req, res) => {
  const origin = (req.headers.origin as string | undefined) ?? '';
  const corsHeaders: Record<string, string> = {
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
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
    if (!requireAllowedOriginForStateChange(req, res, corsHeaders, allowedOrigins)) return;
    if (auth) {
      const isAuthExempt =
        (req.method === 'GET' && (url.pathname === '/login' || url.pathname === '/')) ||
        url.pathname.startsWith('/auth/');
      if (!isAuthExempt) {
        const cookies = parseCookies(req.headers.cookie as string | undefined);
        const v = cookies[auth.cookie.name];
        const ok = v ? verifySessionCookie(auth, v) : null;
        if (!ok) {
          return sendText(res, 401, 'unauthorized', { ...corsHeaders, 'x-auth-login': '/login' });
        }
      }
    }

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

      // --- OpenClaw models / providers bridge ---
      if (req.method === 'GET' && url.pathname === '/openclaw/models/overview') {
        const gateway = makeGatewayClient(req);
        try {
          let overview;
          try {
            overview = await gateway.modelsOverview();
          } catch (err) {
            if (!isGatewayFallbackError(err)) throw err;
            const config = await gateway.configGet();
            overview = normalizeModelsOverview(redactSecrets(config));
          }
          return sendJson(res, 200, overview, corsHeaders);
        } catch (err) {
          const mapped = gatewayErrorToHttp(err);
          return sendJson(res, mapped.status, { error: mapped.message }, corsHeaders);
        }
      }

      if (req.method === 'POST' && url.pathname === '/openclaw/models/providers') {
        const body = await readJson(req);
        let input: ProviderUpsertInput;
        try {
          input = sanitizeProviderUpsertInput(body);
        } catch (err: any) {
          return sendJson(res, 400, { error: String(err?.message ?? err) }, corsHeaders);
        }

        const gateway = makeGatewayClient(req);
        try {
          try {
            await gateway.providerCreate(input);
          } catch (err) {
            if (!isGatewayFallbackError(err)) throw err;
            await upsertProviderViaConfig(gateway, input);
          }

          try {
            await gateway.configApply();
          } catch (err) {
            if (!isGatewayFallbackError(err)) throw err;
          }

          let overview;
          try {
            overview = await gateway.modelsOverview();
          } catch (err) {
            if (!isGatewayFallbackError(err)) throw err;
            overview = normalizeModelsOverview(redactSecrets(await gateway.configGet()));
          }

          sseBroadcast({ type: 'models.changed', payload: {} });
          return sendJson(res, 201, overview, corsHeaders);
        } catch (err) {
          const mapped = gatewayErrorToHttp(err);
          return sendJson(res, mapped.status, { error: mapped.message }, corsHeaders);
        }
      }

      const modelProviderPatchMatch = req.method === 'PATCH' ? url.pathname.match(/^\/openclaw\/models\/providers\/([^/]+)$/) : null;
      if (modelProviderPatchMatch) {
        const providerId = safeDecodeURIComponent(modelProviderPatchMatch[1]);
        const body = await readJson(req);
        const gateway = makeGatewayClient(req);

        const candidate = { ...(asObject(body) ?? {}), id: providerId } as any;
        try {
          if (!normalizeString(candidate.kind) || !normalizeString(candidate.auth_mode) || candidate.enabled === undefined) {
            let existing: any = null;
            try {
              const overview = await gateway.modelsOverview();
              existing = overview.providers.find((p: any) => p.id === providerId) ?? null;
            } catch (err) {
              if (!isGatewayFallbackError(err)) throw err;
              const overview = normalizeModelsOverview(redactSecrets(await gateway.configGet()));
              existing = overview.providers.find((p: any) => p.id === providerId) ?? null;
            }

            if (!existing) return sendJson(res, 404, { error: 'Provider not found' }, corsHeaders);
            if (!normalizeString(candidate.kind)) candidate.kind = existing.kind;
            if (!normalizeString(candidate.auth_mode)) candidate.auth_mode = existing.auth_mode;
            if (candidate.enabled === undefined) candidate.enabled = existing.enabled;
          }
        } catch (err) {
          const mapped = gatewayErrorToHttp(err);
          return sendJson(res, mapped.status, { error: mapped.message }, corsHeaders);
        }

        let input: ProviderUpsertInput;
        try {
          input = sanitizeProviderUpsertInput(candidate);
        } catch (err: any) {
          return sendJson(res, 400, { error: String(err?.message ?? err) }, corsHeaders);
        }

        try {
          try {
            await gateway.providerUpdate(providerId, input);
          } catch (err) {
            if (!isGatewayFallbackError(err)) throw err;
            await upsertProviderViaConfig(gateway, input);
          }

          try {
            await gateway.configApply();
          } catch (err) {
            if (!isGatewayFallbackError(err)) throw err;
          }

          let overview;
          try {
            overview = await gateway.modelsOverview();
          } catch (err) {
            if (!isGatewayFallbackError(err)) throw err;
            overview = normalizeModelsOverview(redactSecrets(await gateway.configGet()));
          }

          sseBroadcast({ type: 'models.changed', payload: {} });
          return sendJson(res, 200, overview, corsHeaders);
        } catch (err) {
          const mapped = gatewayErrorToHttp(err);
          return sendJson(res, mapped.status, { error: mapped.message }, corsHeaders);
        }
      }

      const modelProviderDeleteMatch = req.method === 'DELETE' ? url.pathname.match(/^\/openclaw\/models\/providers\/([^/]+)$/) : null;
      if (modelProviderDeleteMatch) {
        const providerId = safeDecodeURIComponent(modelProviderDeleteMatch[1]);
        const gateway = makeGatewayClient(req);

        try {
          try {
            await gateway.providerDelete(providerId);
          } catch (err) {
            if (!isGatewayFallbackError(err)) throw err;
            const removed = await deleteProviderViaConfig(gateway, providerId);
            if (!removed) return sendJson(res, 404, { error: 'Provider not found' }, corsHeaders);
          }

          try {
            await gateway.configApply();
          } catch (err) {
            if (!isGatewayFallbackError(err)) throw err;
          }

          let overview;
          try {
            overview = await gateway.modelsOverview();
          } catch (err) {
            if (!isGatewayFallbackError(err)) throw err;
            overview = normalizeModelsOverview(redactSecrets(await gateway.configGet()));
          }

          sseBroadcast({ type: 'models.changed', payload: {} });
          return sendJson(res, 200, { ok: true, overview }, corsHeaders);
        } catch (err) {
          const mapped = gatewayErrorToHttp(err);
          return sendJson(res, mapped.status, { error: mapped.message }, corsHeaders);
        }
      }

      if (req.method === 'POST' && url.pathname === '/openclaw/models/scan') {
        const gateway = makeGatewayClient(req);
        try {
          let overview;
          try {
            overview = await gateway.modelsScan();
          } catch (err) {
            if (!isGatewayFallbackError(err)) throw err;
            await gateway.configApply();
            overview = normalizeModelsOverview(redactSecrets(await gateway.configGet()));
          }
          sseBroadcast({ type: 'models.changed', payload: {} });
          return sendJson(res, 200, overview, corsHeaders);
        } catch (err) {
          const mapped = gatewayErrorToHttp(err);
          return sendJson(res, mapped.status, { error: mapped.message }, corsHeaders);
        }
      }

      if (req.method === 'POST' && url.pathname === '/openclaw/models/apply') {
        const gateway = makeGatewayClient(req);
        try {
          await gateway.configApply();
          let overview;
          try {
            overview = await gateway.modelsOverview();
          } catch (err) {
            if (!isGatewayFallbackError(err)) throw err;
            overview = normalizeModelsOverview(redactSecrets(await gateway.configGet()));
          }
          sseBroadcast({ type: 'models.changed', payload: {} });
          return sendJson(res, 200, overview, corsHeaders);
        } catch (err) {
          const mapped = gatewayErrorToHttp(err);
          return sendJson(res, mapped.status, { error: mapped.message }, corsHeaders);
        }
      }

      const modelOauthStartMatch = req.method === 'POST'
        ? url.pathname.match(/^\/openclaw\/models\/providers\/([^/]+)\/oauth\/start$/)
        : null;
      if (modelOauthStartMatch) {
        const providerId = safeDecodeURIComponent(modelOauthStartMatch[1]);
        const gateway = makeGatewayClient(req);
        try {
          const payload = await gateway.oauthStart(providerId);
          return sendJson(res, 200, payload, corsHeaders);
        } catch (err) {
          const mapped = gatewayErrorToHttp(err);
          return sendJson(res, mapped.status, { error: mapped.message }, corsHeaders);
        }
      }

      const modelOauthStatusMatch = req.method === 'GET'
        ? url.pathname.match(/^\/openclaw\/models\/providers\/([^/]+)\/oauth\/status$/)
        : null;
      if (modelOauthStatusMatch) {
        const providerId = safeDecodeURIComponent(modelOauthStatusMatch[1]);
        const attemptId = normalizeString(url.searchParams.get('attemptId') ?? '');
        const gateway = makeGatewayClient(req);
        try {
          const payload = await gateway.oauthStatus(providerId, attemptId || null);
          return sendJson(res, 200, payload, corsHeaders);
        } catch (err) {
          const mapped = gatewayErrorToHttp(err);
          return sendJson(res, mapped.status, { error: mapped.message }, corsHeaders);
        }
      }

      // --- API ---
      if (req.method === 'GET' && url.pathname === '/runs') {
        const status = url.searchParams.get('status');
        const before = parseBeforeIsoCursor(url.searchParams.get('before'), 'before');
        const limit = parsePageLimit(
          url.searchParams.get('limit'),
          Math.max(1, parseNonNegativeInt(process.env.DZZENOS_RUNS_PAGE_SIZE, 100)),
          500
        );
        const stuckMinutesRaw = url.searchParams.get('stuckMinutes');
        const stuckMinutes = stuckMinutesRaw == null ? null : Number(stuckMinutesRaw);
        const projectId = normalizeString(url.searchParams.get('projectId') ?? url.searchParams.get('workspaceId') ?? '') || null;

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
        if (projectId) {
          where.push('r.workspace_id = ?');
          params.push(projectId);
        }
        if (before) {
          where.push('r.created_at < ?');
          params.push(before);
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
            r.workspace_id as project_id,
            r.workspace_id,
            r.board_id as section_id,
            r.board_id,
            r.task_id,
            r.agent_name,
            r.status,
            r.started_at,
            r.finished_at,
            r.created_at,
            r.updated_at,
            r.input_tokens,
            r.output_tokens,
            r.total_tokens,
            t.title as task_title,
            CASE
              WHEN r.status = 'running' AND julianday(r.created_at) < julianday('now') - (? / 1440.0) THEN 1
              ELSE 0
            END as is_stuck
          FROM agent_runs r
          LEFT JOIN tasks t ON t.id = r.task_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY r.created_at DESC, r.id DESC
          LIMIT ?
        `;

        const isStuckMinutes = stuckMinutes != null ? stuckMinutes : 5;
        const rows = db.prepare(sql).all(...params, isStuckMinutes, limit) as any[];
        const payload = rows.map((r) => ({ ...r, is_stuck: Boolean(r.is_stuck) }));
        return sendJson(res, 200, payload, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/approvals') {
        const status = url.searchParams.get('status');
        const projectId = normalizeString(url.searchParams.get('projectId') ?? url.searchParams.get('workspaceId') ?? '') || null;
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
        if (projectId) {
          where.push('r.workspace_id = ?');
          params.push(projectId);
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
               r.workspace_id as project_id,
               r.workspace_id as workspace_id,
               r.board_id as section_id,
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

        const approvalMeta = rowOrNull<{
          task_id: string | null;
          board_id: string | null;
          section_id: string | null;
          project_id: string | null;
          workspace_id: string | null;
        }>(
          db
            .prepare(
              `SELECT r.task_id as task_id,
                      r.board_id as section_id,
                      r.board_id as board_id,
                      r.workspace_id as project_id,
                      r.workspace_id as workspace_id
               FROM approvals a
               JOIN agent_runs r ON r.id = a.run_id
               WHERE a.id = ?`
            )
            .all(id) as any
        );

        sseBroadcast({
          type: 'approvals.changed',
          payload: {
            approvalId: id,
            status: nextStatus,
            taskId: approvalMeta?.task_id ?? null,
            sectionId: approvalMeta?.section_id ?? null,
            boardId: approvalMeta?.board_id ?? null,
            projectId: approvalMeta?.project_id ?? null,
            workspaceId: approvalMeta?.workspace_id ?? null,
          },
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
                 r.workspace_id as project_id,
                 r.workspace_id as workspace_id,
                 r.board_id as section_id,
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

      if (req.method === 'GET' && url.pathname === '/openclaw/cron/status') {
        try {
          const status = openClawCronStatus();
          return sendJson(res, 200, status, corsHeaders);
        } catch (err: any) {
          return sendJson(res, 502, { error: String(err?.message ?? err) }, corsHeaders);
        }
      }

      if (req.method === 'GET' && url.pathname === '/openclaw/cron/jobs') {
        const includeDisabled = url.searchParams.get('all') === '1' || url.searchParams.get('all') === 'true';
        try {
          const { raw, jobs } = openClawCronList({ includeDisabled });
          return sendJson(res, 200, { jobs, raw }, corsHeaders);
        } catch (err: any) {
          return sendJson(res, 502, { error: String(err?.message ?? err) }, corsHeaders);
        }
      }

      const openclawCronRunsMatch = req.method === 'GET' ? url.pathname.match(/^\/openclaw\/cron\/jobs\/([^/]+)\/runs$/) : null;
      if (openclawCronRunsMatch) {
        const jobId = decodeURIComponent(openclawCronRunsMatch[1]);
        const limit = Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50);
        try {
          const runs = openClawCronRuns(jobId, limit);
          return sendJson(res, 200, runs, corsHeaders);
        } catch (err: any) {
          return sendJson(res, 502, { error: String(err?.message ?? err) }, corsHeaders);
        }
      }

      const openclawCronRunMatch = req.method === 'POST' ? url.pathname.match(/^\/openclaw\/cron\/jobs\/([^/]+)\/run$/) : null;
      if (openclawCronRunMatch) {
        const jobId = decodeURIComponent(openclawCronRunMatch[1]);
        const body = await readJson(req);
        const mode = normalizeString(body?.mode) === 'due' ? 'due' : 'force';
        try {
          const run = openClawCronRun(jobId, mode);
          return sendJson(res, 200, run, corsHeaders);
        } catch (err: any) {
          return sendJson(res, 502, { error: String(err?.message ?? err) }, corsHeaders);
        }
      }

      const openclawCronDeleteMatch = req.method === 'DELETE' ? url.pathname.match(/^\/openclaw\/cron\/jobs\/([^/]+)$/) : null;
      if (openclawCronDeleteMatch) {
        const jobId = decodeURIComponent(openclawCronDeleteMatch[1]);
        try {
          const out = openClawCronRemove(jobId);
          return sendJson(res, 200, out, corsHeaders);
        } catch (err: any) {
          return sendJson(res, 502, { error: String(err?.message ?? err) }, corsHeaders);
        }
      }

      const heartbeatGetMatch = req.method === 'GET' ? url.pathname.match(/^\/agents\/([^/]+)\/heartbeat-settings$/) : null;
      if (heartbeatGetMatch) {
        const agentId = decodeURIComponent(heartbeatGetMatch[1]);
        const agent = rowOrNull<{ id: string; workspace_id: string | null }>(
          db.prepare('SELECT id, workspace_id FROM agents WHERE id = ?').all(agentId) as any
        );
        if (!agent) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);
        if (!agent.workspace_id) return sendJson(res, 400, { error: 'Agent has no workspace' }, corsHeaders);
        const settings = getResolvedAgentHeartbeatSettings({ agentId, workspaceId: agent.workspace_id });
        return sendJson(res, 200, heartbeatSettingsToDto(settings), corsHeaders);
      }

      const heartbeatPutMatch = req.method === 'PUT' ? url.pathname.match(/^\/agents\/([^/]+)\/heartbeat-settings$/) : null;
      if (heartbeatPutMatch) {
        const agentId = decodeURIComponent(heartbeatPutMatch[1]);
        const agent = rowOrNull<{ id: string; workspace_id: string | null }>(
          db.prepare('SELECT id, workspace_id FROM agents WHERE id = ?').all(agentId) as any
        );
        if (!agent) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);
        if (!agent.workspace_id) return sendJson(res, 400, { error: 'Agent has no workspace' }, corsHeaders);
        const body = await readJson(req);

        const prev = getResolvedAgentHeartbeatSettings({ agentId, workspaceId: agent.workspace_id });
        const enabled =
          body?.enabled === undefined
            ? Boolean(prev.enabled)
            : body.enabled === false
              ? false
              : true;
        const intervalMinutes =
          body?.interval_minutes !== undefined || body?.intervalMinutes !== undefined
            ? normalizeIntervalMinutes(body?.interval_minutes ?? body?.intervalMinutes, 15)
            : normalizeIntervalMinutes(prev.interval_minutes, 15);
        const offsetMinutes =
          body?.offset_minutes !== undefined || body?.offsetMinutes !== undefined
            ? normalizeOffsetMinutes(body?.offset_minutes ?? body?.offsetMinutes)
            : normalizeOffsetMinutes(prev.offset_minutes);
        const mode =
          body?.mode !== undefined
            ? normalizeHeartbeatMode(body.mode)
            : normalizeHeartbeatMode(prev.mode);
        const message =
          body?.message !== undefined
            ? normalizeString(body.message)
            : normalizeString(prev.message);
        const model =
          body?.model === null
            ? null
            : body?.model !== undefined
              ? normalizeString(body.model) || null
              : normalizeString(prev.model) || null;

        db.prepare(
          `INSERT INTO agent_heartbeat_settings(
             agent_id, workspace_id, enabled, interval_minutes, offset_minutes, mode, message, model
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(agent_id) DO UPDATE SET
             workspace_id = excluded.workspace_id,
             enabled = excluded.enabled,
             interval_minutes = excluded.interval_minutes,
             offset_minutes = excluded.offset_minutes,
             mode = excluded.mode,
             message = excluded.message,
             model = excluded.model`
        ).run(
          agentId,
          agent.workspace_id,
          enabled ? 1 : 0,
          intervalMinutes,
          offsetMinutes,
          mode,
          message ||
            'You are on heartbeat duty. Check new mentions, assigned tasks, and recent activity. If nothing actionable, reply HEARTBEAT_OK.',
          model
        );

        const shouldSync = body?.sync === false ? false : true;
        let syncError: string | null = null;
        let syncedRaw: any = null;
        if (shouldSync) {
          try {
            const synced = syncHeartbeatForAgent(agentId);
            syncedRaw = synced.cron_raw ?? null;
          } catch (err: any) {
            syncError = String(err?.message ?? err);
            db.prepare('UPDATE agent_heartbeat_settings SET last_error = ? WHERE agent_id = ?').run(syncError, agentId);
          }
        }

        const settings = getResolvedAgentHeartbeatSettings({ agentId, workspaceId: agent.workspace_id });
        sseBroadcast({ type: 'agents.heartbeat-settings.changed', payload: { agentId } });
        return sendJson(
          res,
          syncError ? 502 : 200,
          {
            ...heartbeatSettingsToDto(settings),
            sync_error: syncError,
            sync_raw: syncedRaw,
          },
          corsHeaders
        );
      }

      const heartbeatRunNowMatch = req.method === 'POST' ? url.pathname.match(/^\/agents\/([^/]+)\/heartbeat-run$/) : null;
      if (heartbeatRunNowMatch) {
        const agentId = decodeURIComponent(heartbeatRunNowMatch[1]);
        const agent = rowOrNull<{ id: string; workspace_id: string | null }>(
          db.prepare('SELECT id, workspace_id FROM agents WHERE id = ?').all(agentId) as any
        );
        if (!agent) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);
        if (!agent.workspace_id) return sendJson(res, 400, { error: 'Agent has no workspace' }, corsHeaders);
        let settings = getResolvedAgentHeartbeatSettings({ agentId, workspaceId: agent.workspace_id });
        let jobId = normalizeString(settings.cron_job_id);
        if (!jobId) {
          try {
            syncHeartbeatForAgent(agentId);
            settings = getResolvedAgentHeartbeatSettings({ agentId, workspaceId: agent.workspace_id });
            jobId = normalizeString(settings.cron_job_id);
          } catch (err: any) {
            return sendJson(res, 502, { error: String(err?.message ?? err) }, corsHeaders);
          }
        }
        if (!jobId) return sendJson(res, 400, { error: 'No cron job linked to heartbeat settings' }, corsHeaders);
        try {
          const run = openClawCronRun(jobId, 'force');
          db.prepare('UPDATE agent_heartbeat_settings SET last_run_at = ?, last_error = NULL WHERE agent_id = ?').run(nowIso(), agentId);
          const refreshed = getResolvedAgentHeartbeatSettings({ agentId, workspaceId: agent.workspace_id });
          return sendJson(res, 200, { run, settings: heartbeatSettingsToDto(refreshed) }, corsHeaders);
        } catch (err: any) {
          const msg = String(err?.message ?? err);
          db.prepare('UPDATE agent_heartbeat_settings SET last_error = ? WHERE agent_id = ?').run(msg, agentId);
          return sendJson(res, 502, { error: msg }, corsHeaders);
        }
      }

      const standupGetMatch = req.method === 'GET' ? url.pathname.match(/^\/workspaces\/([^/]+)\/standup-settings$/) : null;
      if (standupGetMatch) {
        const workspaceId = requireUuid(safeDecodeURIComponent(standupGetMatch[1]), 'workspaceId');
        const workspace = getWorkspaceMeta(workspaceId);
        if (!workspace) return sendJson(res, 404, { error: 'Workspace not found' }, corsHeaders);
        const settings = getResolvedWorkspaceStandupSettings(workspaceId);
        return sendJson(res, 200, standupSettingsToDto(settings), corsHeaders);
      }

      const standupPutMatch = req.method === 'PUT' ? url.pathname.match(/^\/workspaces\/([^/]+)\/standup-settings$/) : null;
      if (standupPutMatch) {
        const workspaceId = requireUuid(safeDecodeURIComponent(standupPutMatch[1]), 'workspaceId');
        const workspace = getWorkspaceMeta(workspaceId);
        if (!workspace) return sendJson(res, 404, { error: 'Workspace not found' }, corsHeaders);
        const body = await readJson(req);

        const prev = getResolvedWorkspaceStandupSettings(workspaceId);
        const enabled =
          body?.enabled === undefined
            ? Boolean(prev.enabled)
            : body.enabled === false
              ? false
              : true;
        const timeUtc =
          body?.time_utc !== undefined || body?.timeUtc !== undefined
            ? normalizeUtcTime(body?.time_utc ?? body?.timeUtc)
            : normalizeUtcTime(prev.time_utc);
        const prompt =
          body?.prompt === null
            ? null
            : body?.prompt !== undefined
              ? normalizeString(body.prompt) || null
              : prev.prompt ?? null;
        const model =
          body?.model === null
            ? null
            : body?.model !== undefined
              ? normalizeString(body.model) || null
              : normalizeString(prev.model) || null;

        db.prepare(
          `INSERT INTO workspace_standup_settings(
             workspace_id, enabled, time_utc, prompt, model
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(workspace_id) DO UPDATE SET
             enabled = excluded.enabled,
             time_utc = excluded.time_utc,
             prompt = excluded.prompt,
             model = excluded.model`
        ).run(workspaceId, enabled ? 1 : 0, timeUtc, prompt, model);

        const shouldSync = body?.sync === false ? false : true;
        let syncError: string | null = null;
        let syncedRaw: any = null;
        if (shouldSync) {
          try {
            const synced = syncStandupForWorkspace(workspaceId);
            syncedRaw = synced.cron_raw ?? null;
          } catch (err: any) {
            syncError = String(err?.message ?? err);
            db.prepare('UPDATE workspace_standup_settings SET last_error = ? WHERE workspace_id = ?').run(syncError, workspaceId);
          }
        }

        const settings = getResolvedWorkspaceStandupSettings(workspaceId);
        sseBroadcast({ type: 'workspaces.standup-settings.changed', payload: { workspaceId } });
        return sendJson(
          res,
          syncError ? 502 : 200,
          {
            ...standupSettingsToDto(settings),
            sync_error: syncError,
            sync_raw: syncedRaw,
          },
          corsHeaders
        );
      }

      const standupRunNowMatch = req.method === 'POST' ? url.pathname.match(/^\/workspaces\/([^/]+)\/standup-run$/) : null;
      if (standupRunNowMatch) {
        const workspaceId = requireUuid(safeDecodeURIComponent(standupRunNowMatch[1]), 'workspaceId');
        const workspace = getWorkspaceMeta(workspaceId);
        if (!workspace) return sendJson(res, 404, { error: 'Workspace not found' }, corsHeaders);
        let settings = getResolvedWorkspaceStandupSettings(workspaceId);
        let jobId = normalizeString(settings.cron_job_id);
        if (!jobId) {
          try {
            syncStandupForWorkspace(workspaceId);
            settings = getResolvedWorkspaceStandupSettings(workspaceId);
            jobId = normalizeString(settings.cron_job_id);
          } catch (err: any) {
            return sendJson(res, 502, { error: String(err?.message ?? err) }, corsHeaders);
          }
        }
        if (!jobId) return sendJson(res, 400, { error: 'No cron job linked to standup settings' }, corsHeaders);
        try {
          const run = openClawCronRun(jobId, 'force');
          db.prepare('UPDATE workspace_standup_settings SET last_run_at = ?, last_error = NULL WHERE workspace_id = ?').run(nowIso(), workspaceId);
          const refreshed = getResolvedWorkspaceStandupSettings(workspaceId);
          return sendJson(res, 200, { run, settings: standupSettingsToDto(refreshed) }, corsHeaders);
        } catch (err: any) {
          const msg = String(err?.message ?? err);
          db.prepare('UPDATE workspace_standup_settings SET last_error = ? WHERE workspace_id = ?').run(msg, workspaceId);
          return sendJson(res, 502, { error: msg }, corsHeaders);
        }
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

        const workspaceId = getDefaultProjectId(db);
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

        try {
          runRetentionCleanup();
        } catch (err) {
          console.error('[dzzenos-api] retention cleanup after automation run failed', err);
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
        const workspaceId = resolveAgentWorkspaceId({
          workspaceId: url.searchParams.get('workspaceId'),
          boardId: url.searchParams.get('boardId'),
        });
        if (!workspaceId) return sendJson(res, 400, { error: 'Missing workspaceId (and no workspace exists)' }, corsHeaders);

        const installedRows = db
          .prepare('SELECT id, preset_key FROM agents WHERE workspace_id = ? AND preset_key IS NOT NULL')
          .all(workspaceId) as any[];
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
        const workspaceId = resolveAgentWorkspaceId({
          workspaceId: url.searchParams.get('workspaceId'),
          boardId: url.searchParams.get('boardId'),
        });
        if (!workspaceId) return sendJson(res, 400, { error: 'Missing workspaceId (and no workspace exists)' }, corsHeaders);

        const presetKey = decodeURIComponent(marketplaceInstallMatch[1]);
        const preset = getMarketplaceAgentPreset(presetKey);
        if (!preset) return sendJson(res, 404, { error: 'Preset not found' }, corsHeaders);
        if (preset.requires_subscription) {
          return sendJson(res, 403, { error: 'Subscription required' }, corsHeaders);
        }

        const existing = rowOrNull<{ id: string }>(
          db.prepare('SELECT id FROM agents WHERE workspace_id = ? AND preset_key = ? LIMIT 1').all(workspaceId, presetKey) as any
        );
        if (existing?.id) return sendJson(res, 200, { id: existing.id }, corsHeaders);

        const id = randomUUID();
        const enabled = 1;
        const role = 'orchestrator';
        const openclawAgentId = DEFAULT_OPENCLAW_AGENT_ID;

        const presetDefaults = {
          preset_key: preset.preset_key,
          workspace_id: workspaceId,
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
            id, workspace_id, display_name, emoji, openclaw_agent_id, enabled, role,
            description, category, tags_json, skills_json, prompt_overrides_json,
            preset_key, preset_defaults_json, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          workspaceId,
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
        const workspaceId = resolveAgentWorkspaceId({
          workspaceId: url.searchParams.get('workspaceId'),
          boardId: url.searchParams.get('boardId'),
        });
        if (!workspaceId) return sendJson(res, 400, { error: 'Missing workspaceId (and no workspace exists)' }, corsHeaders);

        const rows = db
          .prepare(
            `SELECT
              a.id, a.workspace_id, a.display_name, a.emoji, a.openclaw_agent_id, a.enabled, a.role,
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
             WHERE a.workspace_id = ?
             ORDER BY a.enabled DESC, a.sort_order ASC, a.display_name ASC`
          )
          .all(workspaceId) as any[];

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
        const workspaceId = resolveAgentWorkspaceId({
          workspaceId:
            typeof body?.workspaceId === 'string'
              ? body.workspaceId
              : typeof body?.workspace_id === 'string'
                ? body.workspace_id
                : null,
          boardId: typeof body?.boardId === 'string' ? body.boardId : null,
        });
        if (!workspaceId) return sendJson(res, 400, { error: 'Missing workspaceId (and no workspace exists)' }, corsHeaders);

        db.prepare(
          `INSERT INTO agents(
            id, workspace_id, display_name, emoji, openclaw_agent_id, enabled, role,
            description, category, tags_json, skills_json, prompt_overrides_json,
            preset_key, preset_defaults_json, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`
        ).run(
          id,
          workspaceId,
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
                a.id, a.workspace_id, a.display_name, a.emoji, a.openclaw_agent_id, a.enabled, a.role,
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
        const workspaceId = resolveAgentWorkspaceId({
          workspaceId: url.searchParams.get('workspaceId'),
          boardId: url.searchParams.get('boardId'),
        });
        if (!workspaceId) return sendJson(res, 400, { error: 'Missing workspaceId (and no workspace exists)' }, corsHeaders);

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

        params.push(id, workspaceId);
        const info = db.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ? AND workspace_id = ?`).run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);

        const row = rowOrNull<any>(
          db
            .prepare(
              `SELECT
                a.id, a.workspace_id, a.display_name, a.emoji, a.openclaw_agent_id, a.enabled, a.role,
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
               WHERE a.id = ?
                 AND a.workspace_id = ?`
            )
            .all(id, workspaceId) as any
        );

        sseBroadcast({ type: 'agents.changed', payload: {} });
        return sendJson(res, 200, row ? agentRowToDto(row) : { id }, corsHeaders);
      }

      const listSubagentsMatch = req.method === 'GET'
        ? url.pathname.match(/^\/agents\/([^/]+)\/subagents$/)
        : null;
      if (listSubagentsMatch) {
        const agentId = decodeURIComponent(listSubagentsMatch[1]);
        const agent = rowOrNull<{ id: string }>(db.prepare('SELECT id FROM agents WHERE id = ?').all(agentId) as any);
        if (!agent) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);
        return sendJson(res, 200, getAgentSubagents(agentId), corsHeaders);
      }

      const replaceSubagentsMatch = req.method === 'PUT'
        ? url.pathname.match(/^\/agents\/([^/]+)\/subagents$/)
        : null;
      if (replaceSubagentsMatch) {
        const agentId = decodeURIComponent(replaceSubagentsMatch[1]);
        const agent = rowOrNull<{ id: string }>(db.prepare('SELECT id FROM agents WHERE id = ?').all(agentId) as any);
        if (!agent) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);
        const body = await readJson(req);
        const items = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : null;
        if (!items) return sendJson(res, 400, { error: 'Expected array payload' }, corsHeaders);

        db.exec('BEGIN');
        try {
          db.prepare('DELETE FROM agent_subagents WHERE parent_agent_id = ?').run(agentId);
          const ins = db.prepare(
            `INSERT INTO agent_subagents(
              id, parent_agent_id, child_agent_id, role, trigger_rules_json, max_calls, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`
          );
          for (let idx = 0; idx < items.length; idx += 1) {
            const row = items[idx];
            const childAgentId = normalizeString(row?.child_agent_id ?? row?.childAgentId);
            if (!childAgentId) throw new HttpError(400, `child_agent_id is required at index ${idx}`);
            if (childAgentId === agentId) throw new HttpError(400, `child_agent_id cannot equal parent agent at index ${idx}`);
            const child = rowOrNull<{ id: string }>(db.prepare('SELECT id FROM agents WHERE id = ?').all(childAgentId) as any);
            if (!child) throw new HttpError(400, `child agent not found at index ${idx}`);
            const role = normalizeString(row?.role) || '';
            const triggerRules = parseJsonRecord(row?.trigger_rules_json ?? row?.triggerRules ?? {}, {});
            const maxCallsRaw = Number(row?.max_calls ?? row?.maxCalls ?? 3);
            const maxCalls = Number.isFinite(maxCallsRaw) ? Math.max(1, Math.min(50, Math.floor(maxCallsRaw))) : 3;
            const sortOrderRaw = Number(row?.sort_order ?? row?.order ?? idx);
            const sortOrder = Number.isFinite(sortOrderRaw) ? Math.floor(sortOrderRaw) : idx;
            ins.run(randomUUID(), agentId, childAgentId, role, JSON.stringify(triggerRules), maxCalls, sortOrder);
          }
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
        sseBroadcast({ type: 'agents.changed', payload: { agentId } });
        return sendJson(res, 200, { ok: true, items: getAgentSubagents(agentId) }, corsHeaders);
      }

      const patchOrchestrationMatch = req.method === 'PATCH'
        ? url.pathname.match(/^\/agents\/([^/]+)\/orchestration$/)
        : null;
      if (patchOrchestrationMatch) {
        const agentId = decodeURIComponent(patchOrchestrationMatch[1]);
        const agent = rowOrNull<{ id: string }>(db.prepare('SELECT id FROM agents WHERE id = ?').all(agentId) as any);
        if (!agent) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);
        const body = await readJson(req);
        const mode = normalizeString(body?.mode || 'openclaw') || 'openclaw';
        if (mode !== 'openclaw') return sendJson(res, 400, { error: 'mode must be openclaw' }, corsHeaders);
        const delegationBudget = parseJsonRecord(body?.delegation_budget_json ?? body?.delegationBudget ?? {}, {});
        const escalationRules = parseJsonRecord(body?.escalation_rules_json ?? body?.escalationRules ?? {}, {});

        db.prepare(
          `INSERT INTO agent_orchestration_policies(
            agent_id, mode, delegation_budget_json, escalation_rules_json
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(agent_id)
          DO UPDATE SET
            mode = excluded.mode,
            delegation_budget_json = excluded.delegation_budget_json,
            escalation_rules_json = excluded.escalation_rules_json`
        ).run(agentId, mode, JSON.stringify(delegationBudget), JSON.stringify(escalationRules));

        sseBroadcast({ type: 'agents.changed', payload: { agentId } });
        return sendJson(res, 200, getOrchestrationPolicy(agentId), corsHeaders);
      }

      const orchestrationPreviewMatch = req.method === 'GET'
        ? url.pathname.match(/^\/agents\/([^/]+)\/orchestration\/preview$/)
        : null;
      if (orchestrationPreviewMatch) {
        const agentId = decodeURIComponent(orchestrationPreviewMatch[1]);
        const agent = rowOrNull<{ id: string; display_name: string; openclaw_agent_id: string }>(
          db
            .prepare('SELECT id, display_name, openclaw_agent_id FROM agents WHERE id = ?')
            .all(agentId) as any
        );
        if (!agent) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);
        const subagents = getAgentSubagents(agentId);
        const policy = getOrchestrationPolicy(agentId);
        const preview = [
          `Parent agent: ${agent.display_name} (${agent.openclaw_agent_id})`,
          `Mode: ${policy?.mode ?? 'openclaw'}`,
          `Delegation budget: ${JSON.stringify(policy?.delegation_budget_json ?? { max_total_calls: 8, max_parallel: 2 })}`,
          `Escalation rules: ${JSON.stringify(policy?.escalation_rules_json ?? {})}`,
          'Subagents:',
          ...(subagents.length
            ? subagents.map((s, idx) =>
                `${idx + 1}. ${s.child_display_name || s.child_agent_id} (${s.child_openclaw_agent_id}) role="${s.role}" max_calls=${s.max_calls} trigger_rules=${JSON.stringify(s.trigger_rules_json)}`
              )
            : ['(none)']),
        ].join('\n');
        return sendJson(res, 200, { agent_id: agentId, mode: 'openclaw', policy, subagents, preview }, corsHeaders);
      }

      const agentResetMatch = req.method === 'POST' ? url.pathname.match(/^\/agents\/([^/]+)\/reset$/) : null;
      if (agentResetMatch) {
        const workspaceId = resolveAgentWorkspaceId({
          workspaceId: url.searchParams.get('workspaceId'),
          boardId: url.searchParams.get('boardId'),
        });
        if (!workspaceId) return sendJson(res, 400, { error: 'Missing workspaceId (and no workspace exists)' }, corsHeaders);

        const id = decodeURIComponent(agentResetMatch[1]);
        const row = rowOrNull<{ preset_key: string | null; preset_defaults_json: string | null }>(
          db.prepare('SELECT preset_key, preset_defaults_json FROM agents WHERE id = ? AND workspace_id = ?').all(id, workspaceId) as any
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
           WHERE id = ?
             AND workspace_id = ?`
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
          id,
          workspaceId
        );

        const updated = rowOrNull<any>(
          db
            .prepare(
              `SELECT
                a.id, a.workspace_id, a.display_name, a.emoji, a.openclaw_agent_id, a.enabled, a.role,
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
               WHERE a.id = ?
                 AND a.workspace_id = ?`
            )
            .all(id, workspaceId) as any
        );

        sseBroadcast({ type: 'agents.changed', payload: {} });
        return sendJson(res, 200, updated ? agentRowToDto(updated) : { id }, corsHeaders);
      }

      const agentDuplicateMatch = req.method === 'POST' ? url.pathname.match(/^\/agents\/([^/]+)\/duplicate$/) : null;
      if (agentDuplicateMatch) {
        const workspaceId = resolveAgentWorkspaceId({
          workspaceId: url.searchParams.get('workspaceId'),
          boardId: url.searchParams.get('boardId'),
        });
        if (!workspaceId) return sendJson(res, 400, { error: 'Missing workspaceId (and no workspace exists)' }, corsHeaders);

        const id = decodeURIComponent(agentDuplicateMatch[1]);
        const src = rowOrNull<any>(
          db
            .prepare(
              `SELECT
                id, workspace_id, display_name, emoji, openclaw_agent_id, enabled, role,
                description, category, tags_json, skills_json, prompt_overrides_json, sort_order
               FROM agents
               WHERE id = ?
                 AND workspace_id = ?`
            )
            .all(id, workspaceId) as any
        );
        if (!src) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);

        const newId = randomUUID();
        const displayName = `${String(src.display_name ?? 'Agent')} (copy)`;

        db.prepare(
          `INSERT INTO agents(
            id, workspace_id, display_name, emoji, openclaw_agent_id, enabled, role,
            description, category, tags_json, skills_json, prompt_overrides_json,
            preset_key, preset_defaults_json, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`
        ).run(
          newId,
          workspaceId,
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
        const workspaceId = resolveAgentWorkspaceId({
          workspaceId: url.searchParams.get('workspaceId'),
          boardId: url.searchParams.get('boardId'),
        });
        if (!workspaceId) return sendJson(res, 400, { error: 'Missing workspaceId (and no workspace exists)' }, corsHeaders);

        const id = decodeURIComponent(deleteAgentMatch[1]);
        const row = rowOrNull<{ preset_key: string | null }>(
          db.prepare('SELECT preset_key FROM agents WHERE id = ? AND workspace_id = ?').all(id, workspaceId) as any
        );
        if (!row) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);
        if (row.preset_key) {
          return sendJson(res, 400, { error: 'Installed presets cannot be deleted (disable instead)' }, corsHeaders);
        }

        const info = db.prepare('DELETE FROM agents WHERE id = ? AND workspace_id = ?').run(id, workspaceId);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Agent not found' }, corsHeaders);
        sseBroadcast({ type: 'agents.changed', payload: {} });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      // Legacy endpoint (v1): upsert basic fields for a list of agents.
      if (req.method === 'PUT' && url.pathname === '/agents') {
        const body = await readJson(req);
        if (!Array.isArray(body)) return sendJson(res, 400, { error: 'Expected JSON array' }, corsHeaders);
        const workspaceId = resolveAgentWorkspaceId({
          workspaceId: url.searchParams.get('workspaceId'),
          boardId: url.searchParams.get('boardId'),
        });
        if (!workspaceId) return sendJson(res, 400, { error: 'Missing workspaceId (and no workspace exists)' }, corsHeaders);

        const upsert = db.prepare(
          `INSERT INTO agents(id, workspace_id, display_name, emoji, openclaw_agent_id, enabled, role)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             workspace_id = excluded.workspace_id,
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

            upsert.run(id, workspaceId, displayName, emoji, openclawAgentId, enabled, role);
          }
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }

        const rows = db
          .prepare(
            `SELECT
              a.id, a.workspace_id, a.display_name, a.emoji, a.openclaw_agent_id, a.enabled, a.role,
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
             WHERE a.workspace_id = ?
             ORDER BY a.enabled DESC, a.sort_order ASC, a.display_name ASC`
          )
          .all(workspaceId) as any[];

        sseBroadcast({ type: 'agents.changed', payload: {} });
        return sendJson(res, 200, rows.map(agentRowToDto), corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/docs/overview') {
        const doc = getMemoryDoc('overview', '');
        return sendJson(res, 200, { content: doc.content }, corsHeaders);
      }

      if (req.method === 'PUT' && url.pathname === '/docs/overview') {
        const body = await readJson(req);
        const content = typeof body?.content === 'string' ? body.content : '';
        upsertMemoryDoc('overview', '', content, 'docs-overview');
        sseBroadcast({ type: 'docs.changed', payload: { scope: 'overview' } });
        sseBroadcast({ type: 'memory.changed', payload: { scope: 'overview', scopeId: '' } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      const sectionDocsGet = req.method === 'GET' ? url.pathname.match(/^\/docs\/(?:sections|boards)\/([^/]+)$/) : null;
      if (sectionDocsGet) {
        const sectionId = requireUuid(safeDecodeURIComponent(sectionDocsGet[1]), 'sectionId');
        const doc = getMemoryDoc('section', sectionId);
        return sendJson(res, 200, { content: doc.content }, corsHeaders);
      }

      const sectionDocsPut = req.method === 'PUT' ? url.pathname.match(/^\/docs\/(?:sections|boards)\/([^/]+)$/) : null;
      if (sectionDocsPut) {
        const sectionId = requireUuid(safeDecodeURIComponent(sectionDocsPut[1]), 'sectionId');
        const body = await readJson(req);
        const content = typeof body?.content === 'string' ? body.content : '';
        upsertMemoryDoc('section', sectionId, content, 'docs-section');
        sseBroadcast({ type: 'docs.changed', payload: { sectionId, boardId: sectionId } });
        sseBroadcast({ type: 'memory.changed', payload: { scope: 'section', scopeId: sectionId } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      const sectionChangelogGet = req.method === 'GET'
        ? url.pathname.match(/^\/docs\/(?:sections|boards)\/([^/]+)\/changelog$/)
        : null;
      if (sectionChangelogGet) {
        const sectionId = requireUuid(safeDecodeURIComponent(sectionChangelogGet[1]), 'sectionId');
        return sendJson(res, 200, { content: readTextFile(sectionChangelogPath(sectionId)) }, corsHeaders);
      }

      const sectionSummaryPost = req.method === 'POST'
        ? url.pathname.match(/^\/docs\/(?:sections|boards)\/([^/]+)\/summary$/)
        : null;
      if (sectionSummaryPost) {
        const sectionId = requireUuid(safeDecodeURIComponent(sectionSummaryPost[1]), 'sectionId');
        const body = await readJson(req);
        const title = typeof body?.title === 'string' ? body.title.trim() : 'Untitled';
        const summary = typeof body?.summary === 'string' ? body.summary.trim() : '';
        if (!summary) return sendJson(res, 400, { error: 'summary is required' }, corsHeaders);
        appendSectionSummary({ sectionId, title, summary });
        upsertMemoryDoc('section', sectionId, readTextFile(sectionMemoryPath(sectionId)), 'summary-bot');
        sseBroadcast({ type: 'docs.changed', payload: { sectionId, boardId: sectionId } });
        sseBroadcast({ type: 'memory.changed', payload: { scope: 'section', scopeId: sectionId } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/memory/scopes') {
        const projects = db
          .prepare(
            `SELECT
               id,
               name,
               description,
               position,
               COALESCE(is_archived, 0) as is_archived,
               archived_at,
               created_at,
               updated_at
             FROM workspaces
             ORDER BY COALESCE(is_archived, 0) ASC, position ASC, created_at ASC`
          )
          .all();
        const sections = db
          .prepare(
            `SELECT id, workspace_id as project_id, name, description, position, section_kind, view_mode, created_at, updated_at
               FROM boards
              ORDER BY workspace_id ASC, position ASC, created_at ASC`
          )
          .all();
        const agents = db
          .prepare(
            `SELECT id, display_name, openclaw_agent_id, enabled, category, created_at, updated_at
               FROM agents
              ORDER BY enabled DESC, sort_order ASC, display_name ASC`
          )
          .all();
        const tasks = db
          .prepare(
            `SELECT id, board_id as section_id, workspace_id as project_id, title, status, created_at, updated_at
               FROM tasks
              ORDER BY updated_at DESC
              LIMIT 500`
          )
          .all();
        return sendJson(res, 200, { projects, sections, agents, tasks }, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/memory/docs') {
        const scope = normalizeString(url.searchParams.get('scope'));
        if (!new Set(['overview', 'project', 'section', 'agent', 'task']).has(scope)) {
          return sendJson(res, 400, { error: 'scope must be one of overview|project|section|agent|task' }, corsHeaders);
        }
        const scopeId = scope === 'overview' ? '' : normalizeString(url.searchParams.get('id'));
        if (scope !== 'overview' && !scopeId) return sendJson(res, 400, { error: 'id is required for this scope' }, corsHeaders);
        return sendJson(res, 200, getMemoryDoc(scope, scopeId), corsHeaders);
      }

      if (req.method === 'PUT' && url.pathname === '/memory/docs') {
        const body = await readJson(req);
        const scope = normalizeString(body?.scope ?? url.searchParams.get('scope'));
        if (!new Set(['overview', 'project', 'section', 'agent', 'task']).has(scope)) {
          return sendJson(res, 400, { error: 'scope must be one of overview|project|section|agent|task' }, corsHeaders);
        }
        const scopeId =
          scope === 'overview'
            ? ''
            : normalizeString(body?.id ?? body?.scopeId ?? url.searchParams.get('id'));
        if (scope !== 'overview' && !scopeId) return sendJson(res, 400, { error: 'id is required for this scope' }, corsHeaders);
        const content = typeof body?.content === 'string' ? body.content : '';
        const updatedBy = normalizeString(body?.updatedBy) || 'ui';
        upsertMemoryDoc(scope, scopeId, content, updatedBy);
        sseBroadcast({ type: 'memory.changed', payload: { scope, scopeId } });
        if (scope === 'overview') sseBroadcast({ type: 'docs.changed', payload: { scope: 'overview' } });
        if (scope === 'section') sseBroadcast({ type: 'docs.changed', payload: { sectionId: scopeId, boardId: scopeId } });
        return sendJson(res, 200, { ok: true, doc: getMemoryDoc(scope, scopeId) }, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/memory/index/status') {
        const lastJob = rowOrNull<any>(
          db
            .prepare(
              `SELECT id, status, started_at, finished_at, stats_json, error_text, created_at, updated_at
                 FROM memory_index_jobs
                ORDER BY created_at DESC
                LIMIT 1`
            )
            .all() as any
        );
        return sendJson(
          res,
          200,
          {
            status: lastJob?.status ?? 'idle',
            last_job: lastJob
              ? {
                  ...lastJob,
                  stats_json: parseJsonRecord(lastJob.stats_json),
                }
              : null,
          },
          corsHeaders
        );
      }

      if (req.method === 'POST' && url.pathname === '/memory/index/rebuild') {
        const id = randomUUID();
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO memory_index_jobs(id, status, started_at, stats_json)
           VALUES (?, 'running', ?, ?)`
        ).run(id, now, JSON.stringify({ scanned_docs: 0, indexed_chunks: 0 }));
        db.prepare(
          `UPDATE memory_index_jobs
              SET status = 'succeeded',
                  finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                  stats_json = ?
            WHERE id = ?`
        ).run(JSON.stringify({ scanned_docs: 0, indexed_chunks: 0, mode: 'stub' }), id);
        sseBroadcast({ type: 'memory.changed', payload: { indexJobId: id } });
        const job = rowOrNull<any>(
          db
            .prepare(
              `SELECT id, status, started_at, finished_at, stats_json, error_text, created_at, updated_at
                 FROM memory_index_jobs
                WHERE id = ?`
            )
            .all(id) as any
        );
        return sendJson(
          res,
          200,
          {
            ok: true,
            job: job
              ? {
                  ...job,
                  stats_json: parseJsonRecord(job.stats_json),
                }
              : null,
          },
          corsHeaders
        );
      }

      if (req.method === 'GET' && url.pathname === '/memory/models') {
        const row = rowOrNull<any>(
          db
            .prepare(
              `SELECT id, provider_id, model_id, embedding_model_id, updated_at
                 FROM memory_model_config
                WHERE id = 1`
            )
            .all() as any
        );
        return sendJson(
          res,
          200,
          {
            id: 1,
            provider_id: row?.provider_id ?? null,
            model_id: row?.model_id ?? null,
            embedding_model_id: row?.embedding_model_id ?? null,
            updated_at: row?.updated_at ?? null,
          },
          corsHeaders
        );
      }

      if (req.method === 'PUT' && url.pathname === '/memory/models') {
        const body = await readJson(req);
        const providerId = normalizeString(body?.provider_id ?? body?.providerId) || null;
        const modelId = normalizeString(body?.model_id ?? body?.modelId) || null;
        const embeddingModelId = normalizeString(body?.embedding_model_id ?? body?.embeddingModelId) || null;
        db.prepare(
          `INSERT INTO memory_model_config(id, provider_id, model_id, embedding_model_id)
           VALUES (1, ?, ?, ?)
           ON CONFLICT(id)
           DO UPDATE SET
             provider_id = excluded.provider_id,
             model_id = excluded.model_id,
             embedding_model_id = excluded.embedding_model_id`
        ).run(providerId, modelId, embeddingModelId);
        sseBroadcast({ type: 'memory.changed', payload: { models: true } });
        return sendJson(
          res,
          200,
          {
            ok: true,
            config: rowOrNull<any>(
              db
                .prepare(
                  `SELECT id, provider_id, model_id, embedding_model_id, updated_at
                     FROM memory_model_config
                    WHERE id = 1`
                )
                .all() as any
            ),
          },
          corsHeaders
        );
      }

      if (req.method === 'GET' && url.pathname === '/navigation/projects-tree') {
        const projectIdFilter = normalizeString(url.searchParams.get('projectId') ?? '');
        const includeArchived = normalizeString(url.searchParams.get('includeArchived')) === '1';
        const limitRaw = Number(url.searchParams.get('limitPerSection') ?? '');
        const limitPerSection = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(20, Math.max(1, Math.floor(limitRaw))) : 5;
        const where: string[] = [];
        const params: any[] = [];
        if (projectIdFilter) {
          where.push('w.id = ?');
          params.push(projectIdFilter);
        }
        if (!includeArchived) {
          where.push('COALESCE(w.is_archived, 0) = 0');
        }
        const projectRows = db
          .prepare(
            `SELECT
               w.id,
               w.name,
               w.description,
               w.position,
               COALESCE(w.is_archived, 0) as is_archived,
               w.archived_at,
               w.created_at,
               w.updated_at
             FROM workspaces w
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY COALESCE(w.is_archived, 0) ASC, w.position ASC, w.created_at ASC`
          )
          .all(...params) as any[];

        const projects = projectRows.map((p) => {
          const counters = rowOrNull<any>(
            db
              .prepare(
                `SELECT
                   COUNT(*) as total,
                   SUM(CASE WHEN t.status = 'doing' THEN 1 ELSE 0 END) as doing,
                   SUM(CASE WHEN t.status = 'review' THEN 1 ELSE 0 END) as review
                 FROM tasks t
                 JOIN boards b ON b.id = t.board_id
                 WHERE COALESCE(t.workspace_id, b.workspace_id) = ?`
              )
              .all(p.id) as any
          );
          const needsUserCounter = rowOrNull<any>(
            db
              .prepare(
                `SELECT COUNT(DISTINCT t.id) as c
                   FROM tasks t
                   JOIN boards b ON b.id = t.board_id
                  WHERE COALESCE(t.workspace_id, b.workspace_id) = ?
                    AND (
                      t.status = 'review'
                      OR EXISTS (
                        SELECT 1
                          FROM approvals ap
                          JOIN agent_runs ar ON ar.id = ap.run_id
                         WHERE ap.status = 'pending'
                           AND ar.task_id = t.id
                      )
                    )`
              )
              .all(p.id) as any
          );
          const sectionRows = db
            .prepare(
              `SELECT id, workspace_id as project_id, name, description, position, view_mode, section_kind, created_at, updated_at
                 FROM boards
                WHERE workspace_id = ?
                ORDER BY position ASC, created_at ASC`
            )
            .all(p.id) as any[];
          const sections = sectionRows.map((s) => {
            const sectionCounters = rowOrNull<any>(
              db
                .prepare(
                  `SELECT
                     COUNT(*) as total,
                     SUM(CASE WHEN status = 'doing' THEN 1 ELSE 0 END) as doing,
                     SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) as review
                   FROM tasks
                   WHERE board_id = ?`
                )
                .all(s.id) as any
            );
            const tasks = db
              .prepare(
                `SELECT id, board_id as section_id, board_id, workspace_id as project_id, workspace_id, title, status, updated_at
                   FROM tasks
                  WHERE board_id = ? AND status IN ('doing', 'review')
                  ORDER BY updated_at DESC
                  LIMIT ?`
              )
              .all(s.id, limitPerSection);
            return {
              ...s,
              counters: {
                total: Number(sectionCounters?.total ?? 0),
                doing: Number(sectionCounters?.doing ?? 0),
                review: Number(sectionCounters?.review ?? 0),
              },
              tasks,
            };
          });
          const inProgressTasks = db
            .prepare(
              `SELECT
                 t.id,
                 t.board_id as section_id,
                 t.board_id,
                 COALESCE(t.workspace_id, b.workspace_id) as project_id,
                 COALESCE(t.workspace_id, b.workspace_id) as workspace_id,
                 t.title,
                 t.status,
                 t.updated_at,
                 0 as pending_approval
               FROM tasks t
               JOIN boards b ON b.id = t.board_id
              WHERE COALESCE(t.workspace_id, b.workspace_id) = ?
                AND t.status = 'doing'
              ORDER BY t.updated_at DESC
              LIMIT ?`
            )
            .all(p.id, limitPerSection);
          const needsUserTasks = db
            .prepare(
              `SELECT DISTINCT
                 t.id,
                 t.board_id as section_id,
                 t.board_id,
                 COALESCE(t.workspace_id, b.workspace_id) as project_id,
                 COALESCE(t.workspace_id, b.workspace_id) as workspace_id,
                 t.title,
                 t.status,
                 t.updated_at,
                 CASE
                   WHEN EXISTS (
                     SELECT 1
                       FROM approvals ap
                       JOIN agent_runs ar ON ar.id = ap.run_id
                      WHERE ap.status = 'pending'
                        AND ar.task_id = t.id
                   ) THEN 1
                   ELSE 0
                 END as pending_approval
               FROM tasks t
               JOIN boards b ON b.id = t.board_id
              WHERE COALESCE(t.workspace_id, b.workspace_id) = ?
                AND (
                  t.status = 'review'
                  OR EXISTS (
                    SELECT 1
                      FROM approvals ap
                      JOIN agent_runs ar ON ar.id = ap.run_id
                     WHERE ap.status = 'pending'
                       AND ar.task_id = t.id
                  )
                )
              ORDER BY pending_approval DESC, t.updated_at DESC
              LIMIT ?`
            )
            .all(p.id, limitPerSection);
          return {
            ...p,
            counters: {
              total: Number(counters?.total ?? 0),
              doing: Number(counters?.doing ?? 0),
              review: Number(counters?.review ?? 0),
              needs_user: Number(needsUserCounter?.c ?? 0),
            },
            sections,
            focus_lists: {
              in_progress_total: Number(counters?.doing ?? 0),
              needs_user_total: Number(needsUserCounter?.c ?? 0),
              in_progress: inProgressTasks,
              needs_user: needsUserTasks,
            },
          };
        });

        return sendJson(res, 200, { projects, limit_per_section: limitPerSection }, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/projects') {
        const archivedMode = normalizeString(url.searchParams.get('archived'));
        const where =
          archivedMode === 'only'
            ? 'WHERE COALESCE(w.is_archived, 0) = 1'
            : archivedMode === 'all'
              ? ''
              : 'WHERE COALESCE(w.is_archived, 0) = 0';
        const projects = db
          .prepare(
            `SELECT
               w.id,
               w.name,
               w.description,
               w.position,
               COALESCE(w.is_archived, 0) as is_archived,
               w.archived_at,
               w.created_at,
               w.updated_at,
               (SELECT COUNT(*) FROM boards b WHERE b.workspace_id = w.id) as section_count,
               (SELECT COUNT(*) FROM tasks t WHERE COALESCE(t.workspace_id, w.id) = w.id) as task_count
             FROM workspaces w
             ${where}
             ORDER BY COALESCE(w.is_archived, 0) ASC, w.position ASC, w.created_at ASC`
          )
          .all();
        return sendJson(res, 200, projects, corsHeaders);
      }

      if (req.method === 'POST' && url.pathname === '/projects') {
        const body = await readJson(req);
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        const description = typeof body?.description === 'string' ? body.description : null;
        if (!name) return sendJson(res, 400, { error: 'name is required' }, corsHeaders);

        const projectId = randomUUID();
        const nextPosition = Number(
          rowOrNull<{ v: number }>(
            db.prepare('SELECT COALESCE(MAX(position), -1) as v FROM workspaces WHERE COALESCE(is_archived, 0) = 0').all() as any
          )?.v ?? -1
        ) + 1;
        db.exec('BEGIN');
        try {
          db
            .prepare('INSERT INTO workspaces(id, name, description, position, is_archived, archived_at) VALUES (?, ?, ?, ?, 0, NULL)')
            .run(projectId, name, description, nextPosition);
          const insSection = db.prepare(
            'INSERT INTO boards(id, workspace_id, name, description, position, view_mode, section_kind) VALUES (?, ?, ?, ?, ?, ?, ?)'
          );
          for (const section of DEFAULT_PROJECT_SECTIONS) {
            insSection.run(
              randomUUID(),
              projectId,
              section.name,
              section.description,
              section.position,
              section.viewMode,
              section.kind
            );
          }
          const insStatus = db.prepare(
            'INSERT INTO project_statuses(id, workspace_id, status_key, label, position) VALUES (?, ?, ?, ?, ?)'
          );
          for (const status of DEFAULT_PROJECT_STATUSES) {
            insStatus.run(randomUUID(), projectId, status.key, status.label, status.position);
          }
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }

        const project = rowOrNull<any>(
          db
            .prepare(
              `SELECT id, name, description, position, COALESCE(is_archived, 0) as is_archived, archived_at, created_at, updated_at
                 FROM workspaces
                WHERE id = ?`
            )
            .all(projectId) as any
        );
        sseBroadcast({ type: 'projects.changed', payload: { projectId, workspaceId: projectId } });
        sseBroadcast({ type: 'sections.changed', payload: { projectId, workspaceId: projectId } });
        sseBroadcast({ type: 'boards.changed', payload: { workspaceId: projectId } });
        return sendJson(res, 201, project, corsHeaders);
      }

      if (req.method === 'POST' && url.pathname === '/projects/reorder') {
        const body = await readJson(req);
        const orderedIds = Array.isArray(body?.orderedIds) ? body.orderedIds.map((id: any) => String(id)) : [];
        if (orderedIds.length === 0) return sendJson(res, 400, { error: 'orderedIds must be a non-empty array' }, corsHeaders);

        db.exec('BEGIN');
        try {
          const upd = db.prepare(
            'UPDATE workspaces SET position = ? WHERE id = ? AND COALESCE(is_archived, 0) = 0'
          );
          orderedIds.forEach((id: string, idx: number) => {
            upd.run(idx, id);
          });
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }

        sseBroadcast({ type: 'projects.changed', payload: {} });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      const patchProjectMatch = req.method === 'PATCH' ? url.pathname.match(/^\/projects\/([^/]+)$/) : null;
      if (patchProjectMatch) {
        const projectId = decodeURIComponent(patchProjectMatch[1]);
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
          params.push(Math.max(0, Math.floor(position)));
        }
        if (body?.isArchived !== undefined || body?.is_archived !== undefined) {
          const raw = body?.isArchived ?? body?.is_archived;
          const isArchived =
            raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true';
          updates.push('is_archived = ?');
          params.push(isArchived ? 1 : 0);
          updates.push('archived_at = ?');
          params.push(isArchived ? new Date().toISOString() : null);
          if (body?.position === undefined) {
            const maxRow = rowOrNull<{ v: number }>(
              db
                .prepare(
                  'SELECT COALESCE(MAX(position), -1) as v FROM workspaces WHERE COALESCE(is_archived, 0) = ? AND id <> ?'
                )
                .all(isArchived ? 1 : 0, projectId) as any
            );
            updates.push('position = ?');
            params.push(Number(maxRow?.v ?? -1) + 1);
          }
        }
        if (!updates.length) {
          return sendJson(res, 400, { error: 'No valid fields to update (name/description/position/isArchived)' }, corsHeaders);
        }

        params.push(projectId);
        const info = db.prepare(`UPDATE workspaces SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Project not found' }, corsHeaders);

        const project = rowOrNull<any>(
          db
            .prepare(
              `SELECT id, name, description, position, COALESCE(is_archived, 0) as is_archived, archived_at, created_at, updated_at
                 FROM workspaces
                WHERE id = ?`
            )
            .all(projectId) as any
        );
        sseBroadcast({ type: 'projects.changed', payload: { projectId, workspaceId: projectId } });
        return sendJson(res, 200, project, corsHeaders);
      }

      const deleteProjectMatch = req.method === 'DELETE' ? url.pathname.match(/^\/projects\/([^/]+)$/) : null;
      if (deleteProjectMatch) {
        const projectId = decodeURIComponent(deleteProjectMatch[1]);
        const info = db.prepare('DELETE FROM workspaces WHERE id = ?').run(projectId);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Project not found' }, corsHeaders);
        sseBroadcast({ type: 'projects.changed', payload: { projectId, workspaceId: projectId } });
        sseBroadcast({ type: 'sections.changed', payload: { projectId, workspaceId: projectId } });
        sseBroadcast({ type: 'boards.changed', payload: { workspaceId: projectId } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      const listSectionsMatch = req.method === 'GET' ? url.pathname.match(/^\/projects\/([^/]+)\/sections$/) : null;
      if (listSectionsMatch) {
        const projectId = decodeURIComponent(listSectionsMatch[1]);
        const sections = db
          .prepare(
            `SELECT
               id,
               workspace_id as project_id,
               workspace_id,
               name,
               description,
               position,
               view_mode,
               section_kind,
               created_at,
               updated_at
             FROM boards
             WHERE workspace_id = ?
             ORDER BY position ASC, created_at ASC`
          )
          .all(projectId);
        return sendJson(res, 200, sections, corsHeaders);
      }

      const createSectionMatch = req.method === 'POST' ? url.pathname.match(/^\/projects\/([^/]+)\/sections$/) : null;
      if (createSectionMatch) {
        const projectId = decodeURIComponent(createSectionMatch[1]);
        const body = await readJson(req);
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        const description = typeof body?.description === 'string' ? body.description : null;
        const viewMode = normalizeString(body?.viewMode ?? body?.view_mode) || 'kanban';
        const sectionKind = normalizeString(body?.sectionKind ?? body?.section_kind) || 'section';

        if (!name) return sendJson(res, 400, { error: 'name is required' }, corsHeaders);
        if (viewMode !== 'kanban' && viewMode !== 'threads') {
          return sendJson(res, 400, { error: 'viewMode must be kanban or threads' }, corsHeaders);
        }
        if (sectionKind !== 'section' && sectionKind !== 'inbox') {
          return sendJson(res, 400, { error: 'sectionKind must be section or inbox' }, corsHeaders);
        }

        const project = rowOrNull<{ id: string }>(db.prepare('SELECT id FROM workspaces WHERE id = ?').all(projectId) as any);
        if (!project) return sendJson(res, 404, { error: 'Project not found' }, corsHeaders);

        const sectionId = randomUUID();
        db.prepare(
          'INSERT INTO boards(id, workspace_id, name, description, position, view_mode, section_kind) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
          sectionId,
          projectId,
          name,
          description,
          Number.isFinite(Number(body?.position)) ? Number(body.position) : 0,
          viewMode,
          sectionKind
        );

        const section = rowOrNull<any>(
          db
            .prepare(
              `SELECT id, workspace_id as project_id, workspace_id, name, description, position, view_mode, section_kind, created_at, updated_at
                 FROM boards WHERE id = ?`
            )
            .all(sectionId) as any
        );
        sseBroadcast({ type: 'sections.changed', payload: { projectId, sectionId, boardId: sectionId, workspaceId: projectId } });
        sseBroadcast({ type: 'boards.changed', payload: { boardId: sectionId, workspaceId: projectId } });
        return sendJson(res, 201, section, corsHeaders);
      }

      const patchSectionMatch = req.method === 'PATCH'
        ? url.pathname.match(/^\/projects\/([^/]+)\/sections\/([^/]+)$/)
        : null;
      if (patchSectionMatch) {
        const projectId = decodeURIComponent(patchSectionMatch[1]);
        const sectionId = decodeURIComponent(patchSectionMatch[2]);
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
        if (body?.viewMode !== undefined || body?.view_mode !== undefined) {
          const viewMode = normalizeString(body?.viewMode ?? body?.view_mode);
          if (viewMode !== 'kanban' && viewMode !== 'threads') {
            return sendJson(res, 400, { error: 'viewMode must be kanban or threads' }, corsHeaders);
          }
          updates.push('view_mode = ?');
          params.push(viewMode);
        }
        if (body?.sectionKind !== undefined || body?.section_kind !== undefined) {
          const sectionKind = normalizeString(body?.sectionKind ?? body?.section_kind);
          if (sectionKind !== 'section' && sectionKind !== 'inbox') {
            return sendJson(res, 400, { error: 'sectionKind must be section or inbox' }, corsHeaders);
          }
          updates.push('section_kind = ?');
          params.push(sectionKind);
        }
        if (!updates.length) {
          return sendJson(res, 400, { error: 'No valid fields to update (name/description/position/viewMode/sectionKind)' }, corsHeaders);
        }

        params.push(sectionId, projectId);
        const info = db.prepare(`UPDATE boards SET ${updates.join(', ')} WHERE id = ? AND workspace_id = ?`).run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Section not found' }, corsHeaders);

        const section = rowOrNull<any>(
          db
            .prepare(
              `SELECT id, workspace_id as project_id, workspace_id, name, description, position, view_mode, section_kind, created_at, updated_at
                 FROM boards WHERE id = ?`
            )
            .all(sectionId) as any
        );
        sseBroadcast({ type: 'sections.changed', payload: { projectId, sectionId, boardId: sectionId, workspaceId: projectId } });
        sseBroadcast({ type: 'boards.changed', payload: { boardId: sectionId, workspaceId: projectId } });
        return sendJson(res, 200, section, corsHeaders);
      }

      const deleteSectionMatch = req.method === 'DELETE'
        ? url.pathname.match(/^\/projects\/([^/]+)\/sections\/([^/]+)$/)
        : null;
      if (deleteSectionMatch) {
        const projectId = decodeURIComponent(deleteSectionMatch[1]);
        const sectionId = decodeURIComponent(deleteSectionMatch[2]);
        const info = db.prepare('DELETE FROM boards WHERE id = ? AND workspace_id = ?').run(sectionId, projectId);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Section not found' }, corsHeaders);
        sseBroadcast({ type: 'sections.changed', payload: { projectId, sectionId, boardId: sectionId, workspaceId: projectId } });
        sseBroadcast({ type: 'boards.changed', payload: { boardId: sectionId, workspaceId: projectId } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      const listProjectStatusesMatch = req.method === 'GET' ? url.pathname.match(/^\/projects\/([^/]+)\/statuses$/) : null;
      if (listProjectStatusesMatch) {
        const projectId = decodeURIComponent(listProjectStatusesMatch[1]);
        const rows = db
          .prepare(
            `SELECT id, workspace_id as project_id, workspace_id, status_key, label, position, created_at, updated_at
               FROM project_statuses
              WHERE workspace_id = ?
              ORDER BY position ASC, created_at ASC`
          )
          .all(projectId);
        return sendJson(res, 200, rows, corsHeaders);
      }

      const createProjectStatusMatch = req.method === 'POST' ? url.pathname.match(/^\/projects\/([^/]+)\/statuses$/) : null;
      if (createProjectStatusMatch) {
        const projectId = decodeURIComponent(createProjectStatusMatch[1]);
        const body = await readJson(req);
        const statusKey = normalizeString(body?.status_key ?? body?.key ?? body?.statusKey);
        const label = normalizeString(body?.label);
        if (!statusKey) return sendJson(res, 400, { error: 'status_key is required' }, corsHeaders);
        if (!label) return sendJson(res, 400, { error: 'label is required' }, corsHeaders);

        const id = randomUUID();
        db.prepare(
          'INSERT INTO project_statuses(id, workspace_id, status_key, label, position) VALUES (?, ?, ?, ?, ?)'
        ).run(id, projectId, statusKey, label, Number.isFinite(Number(body?.position)) ? Number(body.position) : 0);

        const row = rowOrNull<any>(
          db
            .prepare(
              `SELECT id, workspace_id as project_id, workspace_id, status_key, label, position, created_at, updated_at
                 FROM project_statuses WHERE id = ?`
            )
            .all(id) as any
        );
        sseBroadcast({ type: 'projects.changed', payload: { projectId, workspaceId: projectId } });
        return sendJson(res, 201, row, corsHeaders);
      }

      const patchProjectStatusMatch = req.method === 'PATCH'
        ? url.pathname.match(/^\/projects\/([^/]+)\/statuses\/([^/]+)$/)
        : null;
      if (patchProjectStatusMatch) {
        const projectId = decodeURIComponent(patchProjectStatusMatch[1]);
        const statusId = decodeURIComponent(patchProjectStatusMatch[2]);
        const body = await readJson(req);
        const updates: string[] = [];
        const params: any[] = [];

        if (body?.status_key !== undefined || body?.key !== undefined || body?.statusKey !== undefined) {
          const statusKey = normalizeString(body?.status_key ?? body?.key ?? body?.statusKey);
          if (!statusKey) return sendJson(res, 400, { error: 'status_key must be non-empty' }, corsHeaders);
          updates.push('status_key = ?');
          params.push(statusKey);
        }
        if (body?.label !== undefined) {
          const label = normalizeString(body?.label);
          if (!label) return sendJson(res, 400, { error: 'label must be non-empty' }, corsHeaders);
          updates.push('label = ?');
          params.push(label);
        }
        if (body?.position !== undefined) {
          const position = Number(body.position);
          if (!Number.isFinite(position)) return sendJson(res, 400, { error: 'position must be a number' }, corsHeaders);
          updates.push('position = ?');
          params.push(position);
        }
        if (!updates.length) {
          return sendJson(res, 400, { error: 'No valid fields to update (status_key/label/position)' }, corsHeaders);
        }
        params.push(statusId, projectId);
        const info = db.prepare(`UPDATE project_statuses SET ${updates.join(', ')} WHERE id = ? AND workspace_id = ?`).run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Project status not found' }, corsHeaders);

        const row = rowOrNull<any>(
          db
            .prepare(
              `SELECT id, workspace_id as project_id, workspace_id, status_key, label, position, created_at, updated_at
                 FROM project_statuses WHERE id = ?`
            )
            .all(statusId) as any
        );
        sseBroadcast({ type: 'projects.changed', payload: { projectId, workspaceId: projectId } });
        return sendJson(res, 200, row, corsHeaders);
      }

      // Legacy board endpoints remain available as aliases to sections.
      if (req.method === 'GET' && url.pathname === '/boards') {
        const boards = db
          .prepare(
            `SELECT
               id,
               workspace_id,
               workspace_id as project_id,
               name,
               description,
               position,
               view_mode,
               section_kind,
               created_at,
               updated_at
             FROM boards
             ORDER BY position ASC, created_at ASC`
          )
          .all();
        return sendJson(res, 200, boards, corsHeaders);
      }

      if (req.method === 'POST' && url.pathname === '/boards') {
        const body = await readJson(req);
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        const description = typeof body?.description === 'string' ? body.description : null;
        let projectId =
          (typeof body?.projectId === 'string' ? body.projectId : null) ??
          (typeof body?.workspaceId === 'string' ? body.workspaceId : null);
        if (!projectId) projectId = getDefaultProjectId(db);
        if (!projectId) return sendJson(res, 400, { error: 'Missing projectId (and no project exists)' }, corsHeaders);
        if (!name) return sendJson(res, 400, { error: 'name is required' }, corsHeaders);

        const viewMode = normalizeString(body?.viewMode ?? body?.view_mode) || 'kanban';
        const sectionKind = normalizeString(body?.sectionKind ?? body?.section_kind) || 'section';
        if (viewMode !== 'kanban' && viewMode !== 'threads') {
          return sendJson(res, 400, { error: 'viewMode must be kanban or threads' }, corsHeaders);
        }
        if (sectionKind !== 'section' && sectionKind !== 'inbox') {
          return sendJson(res, 400, { error: 'sectionKind must be section or inbox' }, corsHeaders);
        }

        const id = randomUUID();
        db.prepare(
          'INSERT INTO boards(id, workspace_id, name, description, position, view_mode, section_kind) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(id, projectId, name, description, body?.position ?? 0, viewMode, sectionKind);

        sseBroadcast({ type: 'sections.changed', payload: { sectionId: id, boardId: id, projectId, workspaceId: projectId } });
        sseBroadcast({ type: 'boards.changed', payload: { boardId: id, workspaceId: projectId } });

        const section = rowOrNull<any>(
          db.prepare(
            `SELECT id, workspace_id, workspace_id as project_id, name, description, position, view_mode, section_kind, created_at, updated_at
               FROM boards WHERE id = ?`
          ).all(id) as any
        );
        return sendJson(res, 201, section, corsHeaders);
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
        if (body?.viewMode !== undefined || body?.view_mode !== undefined) {
          const viewMode = normalizeString(body?.viewMode ?? body?.view_mode);
          if (viewMode !== 'kanban' && viewMode !== 'threads') {
            return sendJson(res, 400, { error: 'viewMode must be kanban or threads' }, corsHeaders);
          }
          updates.push('view_mode = ?');
          params.push(viewMode);
        }

        if (!updates.length) {
          return sendJson(res, 400, { error: 'No valid fields to update (name/description/position/viewMode)' }, corsHeaders);
        }

        params.push(id);
        const info = db.prepare(`UPDATE boards SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Section not found' }, corsHeaders);

        const sectionMeta = rowOrNull<{ workspace_id: string }>(db.prepare('SELECT workspace_id FROM boards WHERE id = ?').all(id) as any);
        sseBroadcast({
          type: 'sections.changed',
          payload: { sectionId: id, boardId: id, projectId: sectionMeta?.workspace_id ?? null, workspaceId: sectionMeta?.workspace_id ?? null },
        });
        sseBroadcast({ type: 'boards.changed', payload: { boardId: id, workspaceId: sectionMeta?.workspace_id ?? null } });

        const section = rowOrNull<any>(
          db.prepare(
            `SELECT id, workspace_id, workspace_id as project_id, name, description, position, view_mode, section_kind, created_at, updated_at
               FROM boards WHERE id = ?`
          ).all(id) as any
        );
        return sendJson(res, 200, section, corsHeaders);
      }

      const deleteBoardMatch = req.method === 'DELETE' ? url.pathname.match(/^\/boards\/([^/]+)$/) : null;
      if (deleteBoardMatch) {
        const id = decodeURIComponent(deleteBoardMatch[1]);
        const sectionMeta = rowOrNull<{ workspace_id: string }>(db.prepare('SELECT workspace_id FROM boards WHERE id = ?').all(id) as any);
        const info = db.prepare('DELETE FROM boards WHERE id = ?').run(id);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Section not found' }, corsHeaders);
        sseBroadcast({
          type: 'sections.changed',
          payload: { sectionId: id, boardId: id, projectId: sectionMeta?.workspace_id ?? null, workspaceId: sectionMeta?.workspace_id ?? null },
        });
        sseBroadcast({ type: 'boards.changed', payload: { boardId: id, workspaceId: sectionMeta?.workspace_id ?? null } });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      const boardAgentSettingsGet = req.method === 'GET' ? url.pathname.match(/^\/boards\/([^/]+)\/agent-settings$/) : null;
      if (boardAgentSettingsGet) {
        const boardId = requireUuid(safeDecodeURIComponent(boardAgentSettingsGet[1]), 'boardId');
        const board = getBoardMeta(boardId);
        if (!board) return sendJson(res, 404, { error: 'Board not found' }, corsHeaders);
        const row = getResolvedBoardAgentSettings(boardId);
        return sendJson(
          res,
          200,
          {
            ...boardAgentSettingsRowToDto(row),
            workspace_id: board.workspace_id,
          },
          corsHeaders
        );
      }

      const boardAgentSettingsPut = req.method === 'PUT' ? url.pathname.match(/^\/boards\/([^/]+)\/agent-settings$/) : null;
      if (boardAgentSettingsPut) {
        const boardId = requireUuid(safeDecodeURIComponent(boardAgentSettingsPut[1]), 'boardId');
        const board = getBoardMeta(boardId);
        if (!board) return sendJson(res, 404, { error: 'Board not found' }, corsHeaders);
        const body = await readJson(req);

        const preferredAgentId =
          body?.preferred_agent_id === null || body?.preferredAgentId === null
            ? null
            : normalizeString(body?.preferred_agent_id ?? body?.preferredAgentId) || null;
        if (preferredAgentId && !getAgentRowById(preferredAgentId, board.workspace_id)) {
          return sendJson(res, 400, { error: 'preferred_agent_id must belong to the board workspace' }, corsHeaders);
        }

        const skills = Array.isArray(body?.skills) ? body.skills : parseStringArrayJson(body?.skills_json);
        const promptOverrides = parsePromptOverridesJson(body?.prompt_overrides ?? body?.prompt_overrides_json);
        const policy = parseJsonObject(body?.policy ?? body?.policy_json);
        const memoryPath = body?.memory_path === null || body?.memoryPath === null
          ? null
          : normalizeString(body?.memory_path ?? body?.memoryPath) || null;
        const autoDelegate = body?.auto_delegate === undefined && body?.autoDelegate === undefined
          ? true
          : body?.auto_delegate === false || body?.autoDelegate === false
            ? false
            : true;
        const subAgents = parseSubAgentsJson(body?.sub_agents ?? body?.sub_agents_json);

        for (const sub of subAgents) {
          if (sub.agent_id && !getAgentRowById(sub.agent_id, board.workspace_id)) {
            return sendJson(res, 400, { error: `sub-agent ${sub.key}: agent_id is not in this workspace` }, corsHeaders);
          }
        }

        db.prepare(
          `INSERT INTO board_agent_settings(
             board_id, preferred_agent_id, skills_json, prompt_overrides_json, policy_json, memory_path, auto_delegate, sub_agents_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(board_id) DO UPDATE SET
             preferred_agent_id = excluded.preferred_agent_id,
             skills_json = excluded.skills_json,
             prompt_overrides_json = excluded.prompt_overrides_json,
             policy_json = excluded.policy_json,
             memory_path = excluded.memory_path,
             auto_delegate = excluded.auto_delegate,
             sub_agents_json = excluded.sub_agents_json`
        ).run(
          boardId,
          preferredAgentId,
          jsonStringifyArray(skills),
          jsonStringifyPromptOverrides(promptOverrides),
          JSON.stringify(policy),
          memoryPath,
          autoDelegate ? 1 : 0,
          jsonStringifySubAgents(subAgents)
        );

        const row = getBoardAgentSettingsRow(boardId);
        sseBroadcast({ type: 'boards.agent-settings.changed', payload: { boardId } });
        return sendJson(
          res,
          200,
          {
            ...(row ? boardAgentSettingsRowToDto(row) : boardAgentSettingsRowToDto(getResolvedBoardAgentSettings(boardId))),
            workspace_id: board.workspace_id,
          },
          corsHeaders
        );
      }

      const workspaceAgentSettingsGet = req.method === 'GET' ? url.pathname.match(/^\/workspaces\/([^/]+)\/agent-settings$/) : null;
      if (workspaceAgentSettingsGet) {
        const workspaceId = requireUuid(safeDecodeURIComponent(workspaceAgentSettingsGet[1]), 'workspaceId');
        const workspace = getWorkspaceMeta(workspaceId);
        if (!workspace) return sendJson(res, 404, { error: 'Workspace not found' }, corsHeaders);
        const row = getResolvedWorkspaceAgentSettings(workspaceId);
        return sendJson(res, 200, workspaceAgentSettingsRowToDto(row), corsHeaders);
      }

      const workspaceAgentSettingsPut = req.method === 'PUT' ? url.pathname.match(/^\/workspaces\/([^/]+)\/agent-settings$/) : null;
      if (workspaceAgentSettingsPut) {
        const workspaceId = requireUuid(safeDecodeURIComponent(workspaceAgentSettingsPut[1]), 'workspaceId');
        const workspace = getWorkspaceMeta(workspaceId);
        if (!workspace) return sendJson(res, 404, { error: 'Workspace not found' }, corsHeaders);
        const body = await readJson(req);

        const preferredAgentId =
          body?.preferred_agent_id === null || body?.preferredAgentId === null
            ? null
            : normalizeString(body?.preferred_agent_id ?? body?.preferredAgentId) || null;
        if (preferredAgentId && !getAgentRowById(preferredAgentId, workspaceId)) {
          return sendJson(res, 400, { error: 'preferred_agent_id must belong to this workspace' }, corsHeaders);
        }

        const skills = Array.isArray(body?.skills) ? body.skills : parseStringArrayJson(body?.skills_json);
        const promptOverrides = parsePromptOverridesJson(body?.prompt_overrides ?? body?.prompt_overrides_json);
        const policy = parseJsonObject(body?.policy ?? body?.policy_json);
        const memoryPath = body?.memory_path === null || body?.memoryPath === null
          ? null
          : normalizeString(body?.memory_path ?? body?.memoryPath) || null;
        const autoDelegate = body?.auto_delegate === undefined && body?.autoDelegate === undefined
          ? true
          : body?.auto_delegate === false || body?.autoDelegate === false
            ? false
            : true;
        const subAgents = parseSubAgentsJson(body?.sub_agents ?? body?.sub_agents_json);

        for (const sub of subAgents) {
          if (sub.agent_id && !getAgentRowById(sub.agent_id, workspaceId)) {
            return sendJson(res, 400, { error: `sub-agent ${sub.key}: agent_id is not in this workspace` }, corsHeaders);
          }
        }

        db.prepare(
          `INSERT INTO workspace_agent_settings(
             workspace_id, preferred_agent_id, skills_json, prompt_overrides_json, policy_json, memory_path, auto_delegate, sub_agents_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(workspace_id) DO UPDATE SET
             preferred_agent_id = excluded.preferred_agent_id,
             skills_json = excluded.skills_json,
             prompt_overrides_json = excluded.prompt_overrides_json,
             policy_json = excluded.policy_json,
             memory_path = excluded.memory_path,
             auto_delegate = excluded.auto_delegate,
             sub_agents_json = excluded.sub_agents_json`
        ).run(
          workspaceId,
          preferredAgentId,
          jsonStringifyArray(skills),
          jsonStringifyPromptOverrides(promptOverrides),
          JSON.stringify(policy),
          memoryPath,
          autoDelegate ? 1 : 0,
          jsonStringifySubAgents(subAgents)
        );

        const row = getWorkspaceAgentSettingsRow(workspaceId);
        sseBroadcast({ type: 'workspaces.agent-settings.changed', payload: { workspaceId } });
        return sendJson(
          res,
          200,
          row ? workspaceAgentSettingsRowToDto(row) : workspaceAgentSettingsRowToDto(getResolvedWorkspaceAgentSettings(workspaceId)),
          corsHeaders
        );
      }

      if (req.method === 'GET' && url.pathname === '/tasks') {
        const viewMode = normalizeString(url.searchParams.get('viewMode') ?? '');
        const sectionId = normalizeString(url.searchParams.get('sectionId') ?? url.searchParams.get('boardId') ?? '') || null;
        let projectId = normalizeString(url.searchParams.get('projectId') ?? url.searchParams.get('workspaceId') ?? '') || null;
        const queryText = normalizeString(url.searchParams.get('q') ?? '');
        const statusesRaw = normalizeString(url.searchParams.get('statuses') ?? '');
        const statuses = statusesRaw
          ? statusesRaw
              .split(',')
              .map((s) => s.trim())
              .filter((s) => TASK_STATUSES.has(s))
          : [];

        if (!projectId && sectionId) {
          const sectionMeta = rowOrNull<{ workspace_id: string }>(
            db.prepare('SELECT workspace_id FROM boards WHERE id = ?').all(sectionId) as any
          );
          projectId = sectionMeta?.workspace_id ?? null;
        }
        if (!projectId) projectId = getDefaultProjectId(db);
        if (!projectId) return sendJson(res, 400, { error: 'Missing projectId (and no default project exists)' }, corsHeaders);

        const where: string[] = ['COALESCE(t.workspace_id, b.workspace_id) = ?'];
        const params: any[] = [projectId];
        if (sectionId) {
          where.push('t.board_id = ?');
          params.push(sectionId);
        }
        if (statuses.length > 0) {
          where.push(`t.status IN (${statuses.map(() => '?').join(', ')})`);
          params.push(...statuses);
        }
        if (queryText) {
          where.push('(lower(t.title) LIKE ? OR lower(COALESCE(t.description, \'\')) LIKE ?)');
          const needle = `%${queryText.toLowerCase()}%`;
          params.push(needle, needle);
        }

        const tasks = db
          .prepare(
            `SELECT
               t.id,
               COALESCE(t.workspace_id, b.workspace_id) as project_id,
               COALESCE(t.workspace_id, b.workspace_id) as workspace_id,
               t.board_id as section_id,
               t.board_id,
               t.title,
               t.description,
               t.status,
               t.position,
               t.due_at,
               t.is_inbox,
               t.created_at,
               t.updated_at,
               s.agent_id,
               s.status as session_status,
               s.last_run_id,
               a.display_name as agent_display_name,
               r.status as run_status,
               r.started_at as run_started_at,
               r.updated_at as run_updated_at,
               r.finished_at as run_finished_at,
               rs.kind as run_step_kind,
               ? as view_mode
             FROM tasks t
             JOIN boards b ON b.id = t.board_id
             LEFT JOIN task_sessions s ON s.task_id = t.id
             LEFT JOIN agents a ON a.id = s.agent_id
             LEFT JOIN agent_runs r ON r.id = (
               SELECT id FROM agent_runs WHERE task_id = t.id ORDER BY created_at DESC LIMIT 1
             )
             LEFT JOIN run_steps rs ON rs.id = (
               SELECT id FROM run_steps WHERE run_id = r.id ORDER BY step_index DESC LIMIT 1
             )
             WHERE ${where.join(' AND ')}
             ORDER BY t.position ASC, t.created_at ASC`
          )
          .all(viewMode === 'threads' ? 'threads' : 'kanban', ...params);
        return sendJson(res, 200, tasks, corsHeaders);
      }

      if (req.method === 'POST' && url.pathname === '/tasks/reorder') {
        const body = await readJson(req);
        const sectionId = normalizeString(body?.sectionId ?? body?.boardId);
        const projectId = normalizeString(body?.projectId ?? body?.workspaceId);
        const orderedIds = Array.isArray(body?.orderedIds) ? body.orderedIds.map((id: any) => String(id)) : [];
        if (!sectionId) return sendJson(res, 400, { error: 'sectionId is required' }, corsHeaders);
        if (orderedIds.length === 0) return sendJson(res, 400, { error: 'orderedIds must be a non-empty array' }, corsHeaders);

        db.exec('BEGIN');
        try {
          const upd = db.prepare('UPDATE tasks SET position = ? WHERE id = ? AND board_id = ?');
          orderedIds.forEach((id: string, idx: number) => {
            upd.run(idx, id, sectionId);
          });
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }

        const meta = rowOrNull<{ workspace_id: string }>(db.prepare('SELECT workspace_id FROM boards WHERE id = ?').all(sectionId) as any);
        sseBroadcast({
          type: 'tasks.changed',
          payload: {
            sectionId,
            boardId: sectionId,
            projectId: projectId || (meta?.workspace_id ?? null),
            workspaceId: projectId || (meta?.workspace_id ?? null),
          },
        });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      if (req.method === 'POST' && url.pathname === '/tasks') {
        const body = await readJson(req);
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        const description = typeof body?.description === 'string' ? body.description : null;
        const status = typeof body?.status === 'string' ? body.status : 'ideas';
        const requestedSectionId = normalizeString(body?.sectionId ?? body?.boardId) || null;
        let projectId = normalizeString(body?.projectId ?? body?.workspaceId) || null;

        if (!title) return sendJson(res, 400, { error: 'title is required' }, corsHeaders);

        let sectionId = requestedSectionId;
        if (!projectId && sectionId) {
          const sectionMeta = rowOrNull<{ workspace_id: string }>(
            db.prepare('SELECT workspace_id FROM boards WHERE id = ?').all(sectionId) as any
          );
          projectId = sectionMeta?.workspace_id ?? null;
        }
        if (!projectId) projectId = getDefaultProjectId(db);
        if (!projectId) return sendJson(res, 400, { error: 'Missing projectId (and no default project exists)' }, corsHeaders);
        if (!sectionId) sectionId = getProjectInboxSectionId(db, projectId) ?? getDefaultSectionId(db, projectId);
        if (!sectionId) return sendJson(res, 400, { error: 'Missing sectionId (and no default section exists)' }, corsHeaders);

        const sectionRow = rowOrNull<{ id: string; workspace_id: string; section_kind: string }>(
          db.prepare('SELECT id, workspace_id, section_kind FROM boards WHERE id = ?').all(sectionId) as any
        );
        if (!sectionRow) return sendJson(res, 404, { error: 'Section not found' }, corsHeaders);
        if (sectionRow.workspace_id !== projectId) {
          return sendJson(res, 400, { error: 'sectionId does not belong to projectId' }, corsHeaders);
        }

        const projectStatusCount = rowOrNull<{ c: number }>(
          db.prepare('SELECT COUNT(*) as c FROM project_statuses WHERE workspace_id = ?').all(projectId) as any
        )?.c ?? 0;
        const hasStatus = rowOrNull<{ c: number }>(
          db.prepare('SELECT COUNT(*) as c FROM project_statuses WHERE workspace_id = ? AND status_key = ?').all(projectId, status) as any
        )?.c ?? 0;
        if ((projectStatusCount > 0 && hasStatus === 0) || (projectStatusCount === 0 && !TASK_STATUSES.has(status))) {
          return sendJson(res, 400, { error: 'Invalid status' }, corsHeaders);
        }

        const id = randomUUID();
        db.prepare(
          'INSERT INTO tasks(id, board_id, workspace_id, title, description, status, position, is_inbox) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          id,
          sectionId,
          projectId,
          title,
          description,
          status,
          Number.isFinite(Number(body?.position)) ? Number(body.position) : 0,
          sectionRow.section_kind === 'inbox' ? 1 : 0
        );

        sseBroadcast({
          type: 'tasks.changed',
          payload: { sectionId, boardId: sectionId, taskId: id, projectId, workspaceId: projectId },
        });

        const task = rowOrNull<any>(
          db.prepare(
            `SELECT id, board_id as section_id, board_id, workspace_id as project_id, workspace_id,
                    title, description, status, position, due_at, is_inbox, created_at, updated_at
               FROM tasks WHERE id = ?`
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
              `SELECT s.task_id, s.agent_id, s.session_key, s.status, s.last_run_id, s.reasoning_level,
                      s.created_at, s.updated_at,
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
        const hasAgentId = body && Object.prototype.hasOwnProperty.call(body, 'agentId');
        const hasReasoningLevel = body && Object.prototype.hasOwnProperty.call(body, 'reasoningLevel');
        const agentId = hasAgentId ? (typeof body?.agentId === 'string' ? body.agentId : null) : undefined;
        const reasoningLevel = hasReasoningLevel ? (typeof body?.reasoningLevel === 'string' ? body.reasoningLevel : null) : undefined;

        const task = rowOrNull<{ id: string; board_id: string; workspace_id: string }>(
          db
            .prepare(
              `SELECT t.id as id, t.board_id as board_id, b.workspace_id as workspace_id
               FROM tasks t
               JOIN boards b ON b.id = t.board_id
               WHERE t.id = ?`
            )
            .all(taskId) as any
        );
        if (!task) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);

        if (agentId && !getAgentRowById(agentId, task.workspace_id)) {
          return sendJson(res, 400, { error: 'Invalid agentId' }, corsHeaders);
        }
        if (reasoningLevel && !REASONING_LEVELS.has(reasoningLevel as ReasoningLevel)) {
          return sendJson(res, 400, { error: 'Invalid reasoningLevel' }, corsHeaders);
        }

        const sessionOpts: { agentId?: string | null; reasoningLevel?: ReasoningLevel | null } = {};
        if (hasAgentId) sessionOpts.agentId = agentId ?? null;
        if (hasReasoningLevel) sessionOpts.reasoningLevel = (reasoningLevel as ReasoningLevel | null) ?? null;
        ensureTaskSession(task, Object.keys(sessionOpts).length ? sessionOpts : undefined);
        const row = rowOrNull<any>(
          db
            .prepare(
              `SELECT s.task_id, s.agent_id, s.session_key, s.status, s.last_run_id, s.reasoning_level,
                      s.created_at, s.updated_at,
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
        const hasAgentId = body && Object.prototype.hasOwnProperty.call(body, 'agentId');
        const agentId = hasAgentId ? (typeof body?.agentId === 'string' ? body.agentId : null) : undefined;
        try {
          const result = await runTask({ taskId, mode: mode as any, agentId });
          return sendJson(res, 200, result, corsHeaders);
        } catch (err: any) {
          if (String(err?.message ?? '') === 'Invalid agentId') {
            return sendJson(res, 400, { error: 'Invalid agentId' }, corsHeaders);
          }
          return sendJson(res, 500, { error: String(err?.message ?? err) }, corsHeaders);
        }
      }

      const taskStopMatch = req.method === 'POST' ? url.pathname.match(/^\/tasks\/([^/]+)\/stop$/) : null;
      if (taskStopMatch) {
        const taskId = decodeURIComponent(taskStopMatch[1]);
        const session = rowOrNull<{ task_id: string; last_run_id: string | null }>(
          db.prepare('SELECT task_id, last_run_id FROM task_sessions WHERE task_id = ?').all(taskId) as any
        );
        if (!session) return sendJson(res, 404, { error: 'Task session not found' }, corsHeaders);

        const controller = taskAbortControllers.get(taskId);
        if (controller) controller.abort();

        if (session.last_run_id) {
          db.prepare(
            "UPDATE run_steps SET status = 'cancelled', finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE run_id = ? AND status = 'running'"
          ).run(session.last_run_id);
          db.prepare(
            "UPDATE agent_runs SET status = 'cancelled', finished_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ? AND status = 'running'"
          ).run(session.last_run_id);
        }

        db.prepare("UPDATE task_sessions SET status = 'idle' WHERE task_id = ?").run(taskId);
        const taskMeta = getTaskMeta(taskId);
        sseBroadcast({ type: 'runs.changed', payload: { taskId, runId: session.last_run_id } });
        sseBroadcast({
          type: 'tasks.changed',
          payload: {
            taskId,
            sectionId: taskMeta?.section_id ?? null,
            boardId: taskMeta?.board_id ?? null,
            projectId: taskMeta?.project_id ?? null,
            workspaceId: taskMeta?.workspace_id ?? null,
          },
        });
        return sendJson(res, 200, { ok: true, stopped: Boolean(controller), runId: session.last_run_id }, corsHeaders);
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
        const before = parseBeforeIsoCursor(url.searchParams.get('before'), 'before');
        const limit = parsePageLimit(
          url.searchParams.get('limit'),
          Math.max(1, parseNonNegativeInt(process.env.DZZENOS_CHAT_PAGE_SIZE, 200)),
          1000
        );
        const where: string[] = ['task_id = ?'];
        const params: any[] = [taskId];
        if (before) {
          where.push('created_at < ?');
          params.push(before);
        }
        const rows = db
          .prepare(
            `SELECT id, task_id, role, content, created_at
             FROM task_messages
             WHERE ${where.join(' AND ')}
             ORDER BY created_at DESC, id DESC
             LIMIT ?`
          )
          .all(...params, limit) as any[];
        rows.reverse();
        return sendJson(res, 200, rows, corsHeaders);
      }

      const chatPost = req.method === 'POST' ? url.pathname.match(/^\/tasks\/([^/]+)\/chat$/) : null;
      if (chatPost) {
        const taskId = decodeURIComponent(chatPost[1]);
        const body = await readJson(req);
        const text = typeof body?.text === 'string' ? body.text.trim() : '';
        const hasAgentId = body && Object.prototype.hasOwnProperty.call(body, 'agentId');
        const agentId = hasAgentId ? (typeof body?.agentId === 'string' ? body.agentId : null) : undefined;
        if (!text) return sendJson(res, 400, { error: 'text is required' }, corsHeaders);

        const task = getTaskMeta(taskId);
        if (!task) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);
        if (agentId && !getAgentRowById(agentId, task.workspace_id)) {
          return sendJson(res, 400, { error: 'Invalid agentId' }, corsHeaders);
        }

        const session = hasAgentId ? ensureTaskSession(task, { agentId: agentId ?? null }) : ensureTaskSession(task);
        const workspaceSettings = getResolvedWorkspaceAgentSettings(task.workspace_id);
        const boardSettings = getResolvedBoardAgentSettings(task.board_id);
        const agentRow = resolvePreferredTaskAgent({
          task,
          sessionAgentId: session?.agent_id ?? null,
          boardPreferredAgentId: boardSettings.preferred_agent_id ?? null,
          workspacePreferredAgentId: workspaceSettings.preferred_agent_id ?? null,
        });
        const agentOpenClawId = agentRow?.openclaw_agent_id ?? (defaultAgentId || null);
        const { systemPrompt, modePrompt } = resolvePromptForMode({
          mode: 'chat',
          agentPromptOverridesRaw: agentRow?.prompt_overrides_json ?? '{}',
          workspacePromptOverridesRaw: workspaceSettings.prompt_overrides_json ?? '{}',
          boardPromptOverridesRaw: boardSettings.prompt_overrides_json ?? '{}',
        });
        const workspaceSkills = parseStringArrayJson(workspaceSettings.skills_json);
        const boardSkills = parseStringArrayJson(boardSettings.skills_json);
        const agentSkills = parseStringArrayJson(agentRow?.skills_json ?? '[]');
        const effectiveSkills = [...new Set([...agentSkills, ...workspaceSkills, ...boardSkills])];
        const workspacePolicy = parseJsonObject(workspaceSettings.policy_json);
        const boardPolicy = parseJsonObject(boardSettings.policy_json);
        const effectivePolicy = { ...workspacePolicy, ...boardPolicy };
        const memoryPath =
          normalizeString(boardSettings.memory_path ?? '') || normalizeString(workspaceSettings.memory_path ?? '') || null;
        const chatInputParts: string[] = [];
        if (systemPrompt) chatInputParts.push(`System profile:\n${systemPrompt}`);
        chatInputParts.push(modePrompt);
        chatInputParts.push(`Task title: ${task.title}`);
        chatInputParts.push(`Task description: ${task.description ?? ''}`);
        if (effectiveSkills.length) chatInputParts.push(`Preferred skills overlay: ${effectiveSkills.join(', ')}`);
        if (memoryPath) chatInputParts.push(`Memory path hint: ${memoryPath}`);
        if (Object.keys(effectivePolicy).length) chatInputParts.push(`Policy context: ${JSON.stringify(effectivePolicy)}`);
        chatInputParts.push(`User message: ${text}`);
        const chatInputText = chatInputParts.join('\n\n');

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
            sessionKey: session?.session_key ?? `project:${task.workspace_id}:board:${task.board_id}:task:${taskId}`,
            agentOpenClawId,
            text: chatInputText,
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
        try {
          runRetentionCleanup({ taskId });
        } catch (err) {
          console.error('[dzzenos-api] retention cleanup after chat failed', err);
        }

        sseBroadcast({ type: 'task.chat.changed', payload: { taskId } });
        return sendJson(res, 200, { reply }, corsHeaders);
      }

      const requestApprovalMatch = req.method === 'POST'
        ? url.pathname.match(/^\/tasks\/([^/]+)\/request-approval$/)
        : null;
      if (requestApprovalMatch) {
        const taskId = decodeURIComponent(requestApprovalMatch[1]);
        const body = await readJson(req);

        const taskRow = rowOrNull<{ id: string; section_id: string; board_id: string; project_id: string; workspace_id: string; title: string }>(
          db.prepare(
            `SELECT t.id as id,
                    t.board_id as section_id,
                    t.board_id as board_id,
                    COALESCE(t.workspace_id, b.workspace_id) as project_id,
                    COALESCE(t.workspace_id, b.workspace_id) as workspace_id,
                    t.title as title
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
            ).run(runId, taskRow.project_id, taskRow.section_id, taskRow.id, 'user', 'running');
          }

          const approvalId = randomUUID();
          db.prepare(
            'INSERT INTO approvals(id, run_id, step_id, status, request_title, request_body) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(approvalId, runId, stepId, 'pending', requestTitle, requestBody);

          sseBroadcast({
            type: 'approvals.changed',
            payload: {
              approvalId,
              status: 'pending',
              taskId: taskId,
              sectionId: taskRow.section_id,
              boardId: taskRow.board_id,
              projectId: taskRow.project_id,
              workspaceId: taskRow.workspace_id,
            },
          });

          db.exec('COMMIT');
          try {
            runRetentionCleanup({ taskId });
          } catch (err) {
            console.error('[dzzenos-api] retention cleanup after approval failed', err);
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
                   r.workspace_id as project_id,
                   r.workspace_id as workspace_id,
                   r.board_id as section_id,
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

        const taskRow = rowOrNull<{ id: string; section_id: string; board_id: string; project_id: string; workspace_id: string }>(
          db.prepare(
            `SELECT t.id as id,
                    t.board_id as section_id,
                    t.board_id as board_id,
                    COALESCE(t.workspace_id, b.workspace_id) as project_id,
                    COALESCE(t.workspace_id, b.workspace_id) as workspace_id
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
          ).run(runId, taskRow.project_id, taskRow.section_id, taskRow.id, 'simulator', 'running');

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

        try {
          runRetentionCleanup({ taskId });
        } catch (err) {
          console.error('[dzzenos-api] retention cleanup after simulate-run failed', err);
        }

        sseBroadcast({
          type: 'runs.changed',
          payload: {
            runId,
            taskId,
            sectionId: taskRow.section_id,
            boardId: taskRow.board_id,
            projectId: taskRow.project_id,
            workspaceId: taskRow.workspace_id,
          },
        });
        return sendJson(res, 201, { runId }, corsHeaders);
      }

      const runsMatch = req.method === 'GET' ? url.pathname.match(/^\/tasks\/([^/]+)\/runs$/) : null;
      if (runsMatch) {
        const taskId = runsMatch[1];
        const stuckMinutesRaw = url.searchParams.get('stuckMinutes');
        const stuckMinutes = Number(stuckMinutesRaw ?? 5);
        const before = parseBeforeIsoCursor(url.searchParams.get('before'), 'before');
        const limit = parsePageLimit(
          url.searchParams.get('limit'),
          Math.max(1, parseNonNegativeInt(process.env.DZZENOS_TASK_RUNS_PAGE_SIZE, 50)),
          200
        );
        if (stuckMinutesRaw != null && (!Number.isFinite(stuckMinutes) || stuckMinutes < 0)) {
          return sendJson(res, 400, { error: 'stuckMinutes must be a non-negative number' }, corsHeaders);
        }

        const where: string[] = ['task_id = ?'];
        const params: any[] = [taskId];
        if (before) {
          where.push('created_at < ?');
          params.push(before);
        }

        const runs = db
          .prepare(
            `SELECT id, workspace_id as project_id, workspace_id, board_id as section_id, board_id, task_id, agent_name, status, started_at, finished_at, created_at, updated_at,
                    input_tokens, output_tokens, total_tokens,
                    CASE
                      WHEN status = 'running' AND julianday(created_at) < julianday('now') - (? / 1440.0) THEN 1
                      ELSE 0
                    END as is_stuck
             FROM agent_runs
             WHERE ${where.join(' AND ')}
             ORDER BY created_at DESC, id DESC
             LIMIT ?`
          )
          .all(stuckMinutes, ...params, limit) as any[];

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

      const taskDetailsMatch = req.method === 'GET' ? url.pathname.match(/^\/tasks\/([^/]+)$/) : null;
      if (taskDetailsMatch) {
        const taskId = decodeURIComponent(taskDetailsMatch[1]);
        const task = rowOrNull<any>(
          db
            .prepare(
              `SELECT
                 t.id,
                 COALESCE(t.workspace_id, b.workspace_id) as project_id,
                 COALESCE(t.workspace_id, b.workspace_id) as workspace_id,
                 t.board_id as section_id,
                 t.board_id,
                 t.title,
                 t.description,
                 t.status,
                 t.position,
                 t.due_at,
                 t.is_inbox,
                 t.created_at,
                 t.updated_at,
                 b.name as section_name,
                 b.view_mode,
                 s.agent_id,
                 s.status as session_status,
                 s.last_run_id,
                 a.display_name as agent_display_name,
                 r.status as run_status,
                 r.started_at as run_started_at,
                 r.updated_at as run_updated_at,
                 r.finished_at as run_finished_at,
                 rs.kind as run_step_kind
               FROM tasks t
               JOIN boards b ON b.id = t.board_id
               LEFT JOIN task_sessions s ON s.task_id = t.id
               LEFT JOIN agents a ON a.id = s.agent_id
               LEFT JOIN agent_runs r ON r.id = (
                 SELECT id FROM agent_runs WHERE task_id = t.id ORDER BY created_at DESC LIMIT 1
               )
               LEFT JOIN run_steps rs ON rs.id = (
                 SELECT id FROM run_steps WHERE run_id = r.id ORDER BY step_index DESC LIMIT 1
               )
              WHERE t.id = ?`
            )
            .all(taskId) as any
        );
        if (!task) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);
        return sendJson(res, 200, task, corsHeaders);
      }

      const deleteTaskMatch = req.method === 'DELETE' ? url.pathname.match(/^\/tasks\/([^/]+)$/) : null;
      if (deleteTaskMatch) {
        const id = decodeURIComponent(deleteTaskMatch[1]);
        const meta = rowOrNull<{ section_id: string; board_id: string; project_id: string; workspace_id: string }>(
          db
            .prepare(
              `SELECT board_id as section_id, board_id, workspace_id as project_id, workspace_id
                 FROM tasks WHERE id = ?`
            )
            .all(id) as any
        );
        const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);
        sseBroadcast({
          type: 'tasks.changed',
          payload: {
            taskId: id,
            sectionId: meta?.section_id ?? null,
            boardId: meta?.board_id ?? null,
            projectId: meta?.project_id ?? null,
            workspaceId: meta?.workspace_id ?? null,
          },
        });
        return sendJson(res, 200, { ok: true }, corsHeaders);
      }

      const patchMatch = req.method === 'PATCH' ? url.pathname.match(/^\/tasks\/([^/]+)$/) : null;
      if (patchMatch) {
        const id = patchMatch[1];
        const body = await readJson(req);
        const existing = rowOrNull<{
          status: string;
          section_id: string;
          board_id: string;
          project_id: string;
          workspace_id: string;
          title: string;
          description: string | null;
        }>(
          db
            .prepare(
              `SELECT status,
                      board_id as section_id,
                      board_id,
                      workspace_id as project_id,
                      workspace_id,
                      title,
                      description
                 FROM tasks
                WHERE id = ?`
            )
            .all(id) as any
        );
        if (!existing) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);

        const updates: string[] = [];
        const params: any[] = [];
        let nextSectionId = existing.section_id;
        let nextProjectId = existing.project_id;
        let nextWorkspaceId = existing.workspace_id;
        let nextIsInbox: number | null = null;

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
          const projectStatusCount = rowOrNull<{ c: number }>(
            db.prepare('SELECT COUNT(*) as c FROM project_statuses WHERE workspace_id = ?').all(nextProjectId) as any
          )?.c ?? 0;
          const hasStatus = rowOrNull<{ c: number }>(
            db.prepare('SELECT COUNT(*) as c FROM project_statuses WHERE workspace_id = ? AND status_key = ?').all(nextProjectId, status) as any
          )?.c ?? 0;
          if ((projectStatusCount > 0 && hasStatus === 0) || (projectStatusCount === 0 && !TASK_STATUSES.has(status))) {
            return sendJson(res, 400, { error: 'Invalid status' }, corsHeaders);
          }
          updates.push('status = ?');
          params.push(status);
        }

        if (body?.sectionId !== undefined || body?.boardId !== undefined) {
          const sectionId = normalizeString(body?.sectionId ?? body?.boardId);
          if (!sectionId) return sendJson(res, 400, { error: 'sectionId must be a non-empty string' }, corsHeaders);
          const sectionRow = rowOrNull<{ id: string; workspace_id: string; section_kind: string }>(
            db.prepare('SELECT id, workspace_id, section_kind FROM boards WHERE id = ?').all(sectionId) as any
          );
          if (!sectionRow) return sendJson(res, 404, { error: 'Section not found' }, corsHeaders);
          nextSectionId = sectionRow.id;
          nextProjectId = sectionRow.workspace_id;
          nextIsInbox = sectionRow.section_kind === 'inbox' ? 1 : 0;
          updates.push('board_id = ?');
          params.push(nextSectionId);
          updates.push('workspace_id = ?');
          params.push(nextProjectId);
        }

        if (body?.position !== undefined) {
          const position = Number(body.position);
          if (!Number.isFinite(position)) return sendJson(res, 400, { error: 'position must be a number' }, corsHeaders);
          updates.push('position = ?');
          params.push(position);
        }

        if (nextIsInbox != null) {
          updates.push('is_inbox = ?');
          params.push(nextIsInbox);
        }

        if (updates.length === 0) {
          return sendJson(res, 400, { error: 'No valid fields to update (status/title/description/sectionId/position)' }, corsHeaders);
        }

        params.push(id);
        const info = db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        if (info.changes === 0) return sendJson(res, 404, { error: 'Task not found' }, corsHeaders);

        const task = rowOrNull<any>(
          db.prepare(
            `SELECT id, board_id as section_id, board_id, workspace_id as project_id, workspace_id,
                    title, description, status, position, due_at, is_inbox, created_at, updated_at
               FROM tasks WHERE id = ?`
          ).all(id) as any
        );

        sseBroadcast({
          type: 'tasks.changed',
          payload: {
            taskId: id,
            sectionId: task?.section_id ?? null,
            boardId: task?.board_id ?? null,
            projectId: task?.project_id ?? null,
            workspaceId: task?.workspace_id ?? null,
          },
        });

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
              sessionKey: `project:${existing.workspace_id}:board:${existing.board_id}:task:${id}`,
              agentOpenClawId: null,
            });
            appendSectionSummary({
              sectionId: task?.section_id ?? existing.section_id,
              title: task?.title ?? existing.title,
              summary,
            });
            sseBroadcast({
              type: 'docs.changed',
              payload: { sectionId: task?.section_id ?? existing.section_id, boardId: task?.board_id ?? existing.board_id },
            });
          } catch (err) {
            console.error('[dzzenos-api] done summary failed', err);
          }
        }
        return sendJson(res, 200, task, corsHeaders);
      }

      if (req.method === 'GET' && url.pathname === '/') {
        return sendText(res, 200, 'DzzenOS API: try GET /projects', corsHeaders);
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

function isExecutedDirectly() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isExecutedDirectly()) {
  main();
}
