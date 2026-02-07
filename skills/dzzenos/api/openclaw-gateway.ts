type GatewayClientOptions = {
  baseUrl: string;
  token?: string;
  authorizationHeader?: string;
  timeoutMs?: number;
};

type GatewayFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: any;
};

type RpcOptions = {
  method: string;
  params?: Record<string, unknown>;
};

export type OpenClawProvider = {
  id: string;
  kind: string;
  enabled: boolean;
  auth_mode: 'api_key' | 'oauth' | 'none';
  auth_state: 'connected' | 'pending' | 'error' | 'not_configured';
  last_error: string | null;
};

export type OpenClawModel = {
  id: string;
  provider_id: string;
  display_name: string;
  availability: 'ready' | 'degraded' | 'unavailable' | 'unknown';
};

export type ModelsOverview = {
  providers: OpenClawProvider[];
  models: OpenClawModel[];
  updated_at: string;
};

export type OAuthStartResult = {
  provider_id: string;
  attempt_id: string | null;
  auth_url: string | null;
  status: string | null;
  expires_at: string | null;
};

export type OAuthStatusResult = {
  provider_id: string;
  attempt_id: string | null;
  status: 'connected' | 'pending' | 'error' | 'timeout' | 'not_configured';
  message: string | null;
};

export type ProviderUpsertInput = {
  id: string;
  kind: string;
  enabled: boolean;
  auth_mode: 'api_key' | 'oauth' | 'none';
  api_base_url?: string;
  api_key?: string;
  oauth?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

const RPC_PATHS = ['/rpc', '/v1/rpc', '/api/rpc'] as const;
const OVERVIEW_PATHS = ['/models/overview', '/models/status', '/models'] as const;
const SCAN_PATHS = ['/models/scan', '/models/refresh'] as const;
const OAUTH_START_PATHS = [
  (providerId: string) => `/models/providers/${encodeURIComponent(providerId)}/oauth/start`,
  (providerId: string) => `/providers/${encodeURIComponent(providerId)}/oauth/start`,
] as const;
const OAUTH_STATUS_PATHS = [
  (providerId: string) => `/models/providers/${encodeURIComponent(providerId)}/oauth/status`,
  (providerId: string) => `/providers/${encodeURIComponent(providerId)}/oauth/status`,
] as const;
const PROVIDER_CREATE_PATHS = ['/models/providers', '/providers'] as const;
const PROVIDER_UPDATE_PATHS = [
  (providerId: string) => `/models/providers/${encodeURIComponent(providerId)}`,
  (providerId: string) => `/providers/${encodeURIComponent(providerId)}`,
] as const;
const PROVIDER_DELETE_PATHS = [
  (providerId: string) => `/models/providers/${encodeURIComponent(providerId)}`,
  (providerId: string) => `/providers/${encodeURIComponent(providerId)}`,
] as const;
const CONFIG_GET_PATHS = ['/config'] as const;
const CONFIG_PATCH_PATHS = ['/config'] as const;
const CONFIG_APPLY_PATHS = ['/config/apply'] as const;

const SECRET_KEY_RE = /(token|secret|password|api[_-]?key|authorization)/i;

function normalizeString(value: any): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAuthMode(value: any): 'api_key' | 'oauth' | 'none' {
  const v = normalizeString(value).toLowerCase();
  if (v === 'api_key' || v === 'apikey' || v === 'key') return 'api_key';
  if (v === 'oauth') return 'oauth';
  return 'none';
}

function normalizeAuthState(value: any): OpenClawProvider['auth_state'] {
  const v = normalizeString(value).toLowerCase();
  if (v === 'connected' || v === 'ready' || v === 'ok' || v === 'healthy') return 'connected';
  if (v === 'pending' || v === 'authorizing' || v === 'auth_required') return 'pending';
  if (v === 'error' || v === 'failed' || v === 'invalid') return 'error';
  return 'not_configured';
}

function normalizeModelAvailability(value: any): OpenClawModel['availability'] {
  const v = normalizeString(value).toLowerCase();
  if (v === 'ready' || v === 'ok' || v === 'healthy' || v === 'available') return 'ready';
  if (v === 'degraded' || v === 'limited' || v === 'slow') return 'degraded';
  if (v === 'unavailable' || v === 'down' || v === 'error') return 'unavailable';
  return 'unknown';
}

function ensureBaseUrl(baseUrl: string): string {
  const out = normalizeString(baseUrl);
  if (!out) throw new Error('OpenClaw gateway URL is not configured');
  return out.replace(/\/+$/, '');
}

function asObject(value: any): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function joinUrl(baseUrl: string, path: string): string {
  if (!path.startsWith('/')) return `${baseUrl}/${path}`;
  return `${baseUrl}${path}`;
}

async function parseJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(value: any, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const err = (value as any).error;
    if (typeof err === 'string' && err.trim()) return err.trim();
    if (err && typeof err === 'object') {
      if (typeof err.message === 'string' && err.message.trim()) return err.message.trim();
      if (typeof err.code === 'string' && err.code.trim()) return err.code.trim();
    }
    if (typeof (value as any).message === 'string' && (value as any).message.trim()) {
      return (value as any).message.trim();
    }
  }
  return fallback;
}

function isUnsupportedRpcError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('method not found') ||
    m.includes('unknown method') ||
    m.includes('not implemented') ||
    m.includes('unsupported')
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 400 || status === 404 || status === 405 || status === 501;
}

export class OpenClawGatewayError extends Error {
  status: number;
  raw: any;
  constructor(status: number, message: string, raw?: any) {
    super(message);
    this.status = status;
    this.raw = raw;
  }
}

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v)) as T;
  }
  if (!value || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k)) {
      out[k] = typeof v === 'boolean' ? v : '***';
      continue;
    }
    out[k] = redactSecrets(v);
  }
  return out as T;
}

export function sanitizeProviderUpsertInput(raw: any): ProviderUpsertInput {
  const obj = asObject(raw);
  if (!obj) throw new Error('Provider payload must be an object');

  const id = normalizeString(obj.id);
  if (!id) throw new Error('id is required');

  const kind = normalizeString(obj.kind);
  if (!kind) throw new Error('kind is required');

  const auth_mode = normalizeAuthMode(obj.auth_mode);
  const enabled = obj.enabled === false ? false : true;

  const out: ProviderUpsertInput = { id, kind, enabled, auth_mode };

  const apiBaseUrl = normalizeString((obj as any).api_base_url);
  if (apiBaseUrl) out.api_base_url = apiBaseUrl;

  const apiKey = normalizeString((obj as any).api_key);
  if (apiKey) out.api_key = apiKey;

  const oauth = asObject((obj as any).oauth);
  if (oauth) out.oauth = oauth;

  const options = asObject((obj as any).options);
  if (options) out.options = options;

  return out;
}

function extractProvidersRaw(raw: any): Array<{ id: string; value: any }> {
  const src =
    (asObject(raw)?.providers as any) ??
    (asObject(raw)?.model_providers as any) ??
    (asObject((asObject(raw)?.models as any))?.providers as any) ??
    (asObject((asObject(raw)?.status as any))?.providers as any);

  if (Array.isArray(src)) {
    return src.map((v) => {
      const obj = asObject(v) ?? {};
      const id =
        normalizeString((obj as any).id) ||
        normalizeString((obj as any).provider_id) ||
        normalizeString((obj as any).name);
      return { id: id || 'unknown', value: obj };
    });
  }

  const asObj = asObject(src);
  if (!asObj) return [];
  return Object.entries(asObj).map(([k, v]) => ({ id: k, value: v }));
}

function extractModelsRaw(raw: any): Array<{ id: string; value: any }> {
  const src =
    (asObject(raw)?.models as any) ??
    (asObject((asObject(raw)?.status as any))?.models as any) ??
    (asObject((asObject(raw)?.catalog as any))?.models as any);

  if (Array.isArray(src)) {
    return src.map((v) => {
      const obj = asObject(v) ?? {};
      const id =
        normalizeString((obj as any).id) ||
        normalizeString((obj as any).model) ||
        normalizeString((obj as any).name);
      return { id: id || 'unknown', value: obj };
    });
  }

  const asObj = asObject(src);
  if (!asObj) return [];
  return Object.entries(asObj).map(([k, v]) => ({ id: k, value: v }));
}

export function normalizeModelsOverview(raw: any): ModelsOverview {
  const providerMap = new Map<string, OpenClawProvider>();
  for (const entry of extractProvidersRaw(raw)) {
    const obj = asObject(entry.value) ?? {};
    const id =
      normalizeString(entry.id) ||
      normalizeString((obj as any).id) ||
      normalizeString((obj as any).provider_id) ||
      'unknown';
    const kind =
      normalizeString((obj as any).kind) ||
      normalizeString((obj as any).type) ||
      normalizeString((obj as any).provider) ||
      'custom';
    const enabled = (obj as any).enabled === false ? false : true;
    const auth_mode = (() => {
      const direct = normalizeAuthMode((obj as any).auth_mode);
      if (direct !== 'none') return direct;
      return normalizeAuthMode((obj as any).auth && (obj as any).auth.mode);
    })();
    const auth_state = normalizeAuthState(
      (obj as any).auth_state ??
        (obj as any).status ??
        ((obj as any).connected === true ? 'connected' : (obj as any).connected === false ? 'not_configured' : '')
    );
    const last_error =
      normalizeString((obj as any).last_error) ||
      normalizeString((obj as any).error) ||
      normalizeString((obj as any).message) ||
      null;
    providerMap.set(id, {
      id,
      kind,
      enabled,
      auth_mode,
      auth_state,
      last_error,
    });
  }

  const models: OpenClawModel[] = [];
  for (const entry of extractModelsRaw(raw)) {
    const obj = asObject(entry.value) ?? {};
    const id =
      normalizeString(entry.id) ||
      normalizeString((obj as any).id) ||
      normalizeString((obj as any).model) ||
      normalizeString((obj as any).name) ||
      'unknown';
    const provider_id =
      normalizeString((obj as any).provider_id) ||
      normalizeString((obj as any).provider) ||
      normalizeString((obj as any).providerId) ||
      'unknown';
    const display_name =
      normalizeString((obj as any).display_name) ||
      normalizeString((obj as any).name) ||
      normalizeString((obj as any).model) ||
      id;
    const availability = normalizeModelAvailability(
      (obj as any).availability ?? (obj as any).status ?? (obj as any).state
    );
    models.push({ id, provider_id, display_name, availability });
  }

  return {
    providers: [...providerMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    models: models.sort((a, b) => a.id.localeCompare(b.id)),
    updated_at: new Date().toISOString(),
  };
}

export function createOpenClawGatewayClient(options: GatewayClientOptions) {
  const baseUrl = ensureBaseUrl(options.baseUrl);
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 15_000;

  async function gatewayFetch(opts: GatewayFetchOptions): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {};
      const token = normalizeString(options.token);
      const authHeader = normalizeString(options.authorizationHeader);
      if (token) headers.authorization = `Bearer ${token}`;
      else if (authHeader) headers.authorization = authHeader;
      if (opts.body !== undefined) headers['content-type'] = 'application/json';

      const res = await fetch(joinUrl(baseUrl, opts.path), {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      const parsed = await parseJsonSafe(res);
      if (!res.ok) {
        const msg = getErrorMessage(parsed, `OpenClaw gateway HTTP ${res.status}`);
        throw new OpenClawGatewayError(res.status, msg, parsed);
      }
      return parsed;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new OpenClawGatewayError(504, 'OpenClaw gateway request timed out');
      }
      if (err instanceof OpenClawGatewayError) throw err;
      throw new OpenClawGatewayError(502, String(err?.message ?? err));
    } finally {
      clearTimeout(timer);
    }
  }

  async function callRpc({ method, params }: RpcOptions): Promise<any> {
    let lastErr: any = null;

    for (const path of RPC_PATHS) {
      const bodies = [
        { jsonrpc: '2.0', id: Date.now(), method, params: params ?? {} },
        { method, params: params ?? {} },
      ];
      for (const body of bodies) {
        try {
          const raw = await gatewayFetch({ method: 'POST', path, body });
          if (raw && typeof raw === 'object' && 'error' in raw && (raw as any).error) {
            const message = getErrorMessage((raw as any).error, 'OpenClaw RPC error');
            const status = Number((raw as any).error?.status ?? (raw as any).status ?? 400);
            throw new OpenClawGatewayError(status, message, raw);
          }
          if (raw && typeof raw === 'object' && 'result' in raw) return (raw as any).result;
          return raw;
        } catch (err: any) {
          lastErr = err;
          if (!(err instanceof OpenClawGatewayError)) continue;
          if (isRetryableStatus(err.status)) continue;
          if (isUnsupportedRpcError(err.message)) continue;
          throw err;
        }
      }
    }

    if (lastErr instanceof OpenClawGatewayError) throw lastErr;
    throw new OpenClawGatewayError(502, 'OpenClaw RPC endpoint is unavailable');
  }

  async function callRpcCandidates(methods: string[], params?: Record<string, unknown>) {
    let lastErr: any = null;
    for (const method of methods) {
      try {
        return await callRpc({ method, params });
      } catch (err: any) {
        lastErr = err;
        if (err instanceof OpenClawGatewayError) {
          if (isRetryableStatus(err.status) || isUnsupportedRpcError(err.message)) continue;
          throw err;
        }
      }
    }
    if (lastErr instanceof OpenClawGatewayError) throw lastErr;
    throw new OpenClawGatewayError(502, 'OpenClaw RPC methods are unavailable');
  }

  async function callRestCandidates(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    paths: string[],
    body?: any
  ): Promise<any> {
    let lastErr: any = null;
    for (const path of paths) {
      try {
        return await gatewayFetch({ method, path, body });
      } catch (err: any) {
        lastErr = err;
        if (err instanceof OpenClawGatewayError && isRetryableStatus(err.status)) continue;
        if (err instanceof OpenClawGatewayError && err.status >= 500) continue;
        throw err;
      }
    }
    if (lastErr instanceof OpenClawGatewayError) throw lastErr;
    throw new OpenClawGatewayError(502, 'OpenClaw REST endpoint is unavailable');
  }

  function normalizeConfig(raw: any): Record<string, unknown> {
    const direct = asObject(raw);
    if (direct && !Array.isArray(direct)) {
      const cfg = asObject((direct as any).config);
      if (cfg) return cfg;
      return direct;
    }
    return {};
  }

  const api = {
    async configGet(): Promise<Record<string, unknown>> {
      try {
        const rpc = await callRpcCandidates(['config.get']);
        return normalizeConfig(rpc);
      } catch (err) {
        const rest = await callRestCandidates('GET', [...CONFIG_GET_PATHS]);
        return normalizeConfig(rest);
      }
    },

    async configPatch(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
      try {
        const rpc = await callRpcCandidates(['config.patch'], { patch });
        return normalizeConfig(rpc);
      } catch (err) {
        try {
          const rest = await callRestCandidates('PATCH', [...CONFIG_PATCH_PATHS], { patch });
          return normalizeConfig(rest);
        } catch {
          const rest = await callRestCandidates('PATCH', [...CONFIG_PATCH_PATHS], patch);
          return normalizeConfig(rest);
        }
      }
    },

    async configApply(): Promise<any> {
      try {
        return await callRpcCandidates(['config.apply']);
      } catch (err) {
        return await callRestCandidates('POST', [...CONFIG_APPLY_PATHS], {});
      }
    },

    async modelsOverview(): Promise<ModelsOverview> {
      let raw: any = null;
      try {
        raw = await callRpcCandidates(['models.overview', 'models.status', 'models.list']);
      } catch (err) {
        raw = await callRestCandidates('GET', [...OVERVIEW_PATHS]);
      }
      return normalizeModelsOverview(raw);
    },

    async modelsScan(): Promise<ModelsOverview> {
      try {
        await callRpcCandidates(['models.scan', 'models.refresh']);
      } catch (err) {
        await callRestCandidates('POST', [...SCAN_PATHS], {});
      }
      return await api.modelsOverview();
    },

    async providerCreate(input: ProviderUpsertInput): Promise<any> {
      try {
        return await callRpcCandidates(
          ['models.providers.create', 'models.provider.create', 'providers.create'],
          { provider: input }
        );
      } catch (err) {
        return await callRestCandidates('POST', [...PROVIDER_CREATE_PATHS], input);
      }
    },

    async providerUpdate(providerId: string, input: ProviderUpsertInput): Promise<any> {
      const pid = normalizeString(providerId);
      if (!pid) throw new Error('providerId is required');
      try {
        return await callRpcCandidates(
          ['models.providers.update', 'models.provider.update', 'providers.update'],
          { providerId: pid, patch: input, provider: input }
        );
      } catch (err) {
        const paths = PROVIDER_UPDATE_PATHS.map((fn) => fn(pid));
        return await callRestCandidates('PATCH', paths, input);
      }
    },

    async providerDelete(providerId: string): Promise<any> {
      const pid = normalizeString(providerId);
      if (!pid) throw new Error('providerId is required');
      try {
        return await callRpcCandidates(
          ['models.providers.delete', 'models.provider.delete', 'providers.delete'],
          { providerId: pid }
        );
      } catch (err) {
        const paths = PROVIDER_DELETE_PATHS.map((fn) => fn(pid));
        return await callRestCandidates('DELETE', paths);
      }
    },

    async oauthStart(providerId: string): Promise<OAuthStartResult> {
      const pid = normalizeString(providerId);
      if (!pid) throw new Error('providerId is required');

      let raw: any = null;
      try {
        raw = await callRpcCandidates(
          ['models.oauth.start', 'providers.oauth.start', 'oauth.start'],
          { providerId: pid }
        );
      } catch (err) {
        const paths = OAUTH_START_PATHS.map((fn) => fn(pid));
        raw = await callRestCandidates('POST', paths, {});
      }

      const obj = asObject(raw) ?? {};
      return {
        provider_id: pid,
        attempt_id:
          normalizeString((obj as any).attempt_id) || normalizeString((obj as any).attemptId) || null,
        auth_url:
          normalizeString((obj as any).auth_url) ||
          normalizeString((obj as any).authUrl) ||
          normalizeString((obj as any).url) ||
          null,
        status: normalizeString((obj as any).status) || null,
        expires_at:
          normalizeString((obj as any).expires_at) || normalizeString((obj as any).expiresAt) || null,
      };
    },

    async oauthStatus(providerId: string, attemptId?: string | null): Promise<OAuthStatusResult> {
      const pid = normalizeString(providerId);
      if (!pid) throw new Error('providerId is required');

      let raw: any = null;
      const normalizedAttemptId = normalizeString(attemptId ?? '');
      try {
        raw = await callRpcCandidates(
          ['models.oauth.status', 'providers.oauth.status', 'oauth.status'],
          { providerId: pid, attemptId: normalizedAttemptId || undefined }
        );
      } catch (err) {
        const suffix = normalizedAttemptId ? `?attemptId=${encodeURIComponent(normalizedAttemptId)}` : '';
        const paths = OAUTH_STATUS_PATHS.map((fn) => `${fn(pid)}${suffix}`);
        raw = await callRestCandidates('GET', paths);
      }

      const obj = asObject(raw) ?? {};
      const statusRaw =
        normalizeString((obj as any).status) ||
        normalizeString((obj as any).state) ||
        normalizeString((obj as any).auth_state);
      let status: OAuthStatusResult['status'] = 'pending';
      const v = statusRaw.toLowerCase();
      if (v === 'connected' || v === 'ready' || v === 'ok') status = 'connected';
      else if (v === 'error' || v === 'failed') status = 'error';
      else if (v === 'timeout' || v === 'expired') status = 'timeout';
      else if (v === 'not_configured' || v === 'missing') status = 'not_configured';
      else if (v === 'pending' || v === 'authorizing' || v === 'waiting') status = 'pending';

      return {
        provider_id: pid,
        attempt_id:
          normalizeString((obj as any).attempt_id) ||
          normalizeString((obj as any).attemptId) ||
          normalizedAttemptId ||
          null,
        status,
        message:
          normalizeString((obj as any).message) ||
          normalizeString((obj as any).error) ||
          normalizeString((obj as any).detail) ||
          null,
      };
    },
  };

  return api;
}
