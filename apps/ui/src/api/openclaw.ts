export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const OPENRESPONSES_URL =
  (import.meta as any).env?.VITE_OPENRESPONSES_URL ?? '/v1/responses';

function getTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    const existing = sessionStorage.getItem('openclaw_token') ?? '';
    const token = url.searchParams.get('token') ?? '';

    if (token) {
      try {
        sessionStorage.setItem('openclaw_token', token);
      } catch {
        // ignore (storage may be blocked)
      }

      url.searchParams.delete('token');
      try {
        window.history.replaceState({}, '', url.toString());
      } catch {
        // ignore
      }

      return token;
    }

    return existing;
  } catch {
    return '';
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

export async function openclawFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as any) };
  if (init?.body && !headers['content-type']) headers['content-type'] = 'application/json';

  const token = getTokenFromUrl();
  if (token && !headers.authorization) {
    headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const msg =
      typeof body === 'string'
        ? body
        : body && typeof body === 'object' && 'error' in body
          ? String((body as any).error?.message ?? (body as any).error)
          : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return (await parseJsonSafe(res)) as T;
}

/**
 * OpenClaw OpenResponses call.
 *
 * Docs: https://docs.openclaw.ai/gateway/openresponses-http-api
 */
export async function createResponse(input: {
  sessionKey: string;
  text: string;
  agentId?: string;
  model?: string;
}): Promise<string> {
  const model = input.model ?? 'openclaw:main';

  const data = await openclawFetch<any>(OPENRESPONSES_URL, {
    method: 'POST',
    headers: {
      'x-openclaw-session-key': input.sessionKey,
      ...(input.agentId ? { 'x-openclaw-agent-id': input.agentId } : {}),
    },
    body: JSON.stringify({
      model,
      input: input.text,
    }),
  });

  // Best-effort: try to extract assistant text from the OpenResponses output.
  // If shape changes, we fall back to stringifying.
  const output = data?.output;
  if (typeof output === 'string') return output;

  // Some gateways may return { output_text: "..." }
  if (typeof data?.output_text === 'string') return data.output_text;

  // OpenResponses item stream may include output_text parts
  try {
    const items = Array.isArray(output) ? output : [];
    const texts: string[] = [];
    for (const it of items) {
      const content = it?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === 'output_text' && typeof c?.text === 'string') texts.push(c.text);
          if (c?.type === 'text' && typeof c?.text === 'string') texts.push(c.text);
        }
      }
    }
    if (texts.length) return texts.join('');
  } catch {
    // ignore
  }

  throw new Error('OpenResponses: unexpected response shape');
}
