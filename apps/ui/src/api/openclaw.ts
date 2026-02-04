export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const OPENCLAW_BASE = (import.meta as any).env?.VITE_OPENCLAW_BASE ?? '/__openclaw__';
const OPENRESPONSES_BASE =
  (import.meta as any).env?.VITE_OPENRESPONSES_BASE ?? `${OPENCLAW_BASE.replace(/\/$/, '')}/openresponses`;

function withToken(url: string) {
  try {
    const t = new URLSearchParams(window.location.search).get('token');
    if (!t) return url;
    const u = new URL(url, window.location.origin);
    if (!u.searchParams.get('token')) u.searchParams.set('token', t);
    return u.toString();
  } catch {
    return url;
  }
}

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function openclawFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = OPENRESPONSES_BASE;
  const url = withToken(path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`);

  const headers: Record<string, string> = { ...(init?.headers as any) };
  if (init?.body && !headers['content-type']) headers['content-type'] = 'application/json';

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const msg =
      typeof body === 'string'
        ? body
        : body && typeof body === 'object' && 'error' in body
          ? String((body as any).error)
          : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return (await parseJsonSafe(res)) as T;
}

/**
 * Minimal OpenAI-compatible Chat Completions call via OpenClaw OpenResponses.
 *
 * NOTE: This assumes the gateway exposes an OpenAI-compatible endpoint at:
 *   /__openclaw__/openresponses/v1/chat/completions
 */
export async function createChatCompletion(input: {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
}): Promise<string> {
  const model =
    input.model ?? (import.meta as any).env?.VITE_OPENRESPONSES_MODEL ?? 'gpt-4.1-mini';

  const data = await openclawFetch<any>('/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
    }),
  });

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OpenResponses: unexpected response shape');
  return content;
}
