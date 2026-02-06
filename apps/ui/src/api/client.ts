export const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? 'http://127.0.0.1:8787';

function getTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    const existing = sessionStorage.getItem('openclaw_token') ?? '';
    const token = url.searchParams.get('token') ?? '';

    if (token) {
      try {
        sessionStorage.setItem('openclaw_token', token);
      } catch {
        // ignore
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

export async function apiFetch<T>(
  path: string,
  init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = { ...(init?.headers ?? {}) };
  if (init?.body && !headers['content-type']) headers['content-type'] = 'application/json';
  const token = getTokenFromUrl();
  if (token && !headers.authorization) headers.authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    ...init,
    headers,
  });

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
