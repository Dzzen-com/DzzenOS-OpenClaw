#!/usr/bin/env node
import http from 'node:http';
import process from 'node:process';

function parseArgs(argv) {
  const out = { host: '127.0.0.1', port: 11435 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--host') out.host = String(argv[++i] ?? out.host);
    if (arg === '--port') out.port = Number(argv[++i] ?? out.port);
  }
  return out;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(json)),
  });
  res.end(json);
}

function buildMockReply(promptText) {
  const input = String(promptText ?? '');
  const lower = input.toLowerCase();

  if (lower.includes('you are a task planner. return json')) {
    return JSON.stringify(
      {
        description: 'Planned by local mock OpenResponses. Ready for execution.',
        checklist: ['Collect source context', 'Draft result', 'Review output'],
      },
      null,
      2
    );
  }

  if (lower.includes('you are executing the task. return json')) {
    return JSON.stringify(
      {
        status: 'review',
        report: 'Execution completed by local mock OpenResponses.',
      },
      null,
      2
    );
  }

  if (lower.includes('summarize the completed task for changelog')) {
    return '- Completed task via local mock\n- Updated state and notes';
  }

  return 'Mock OpenResponses reply: request accepted.';
}

async function main() {
  const { host, port } = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/healthz') {
      return sendJson(res, 200, { ok: true, started_at: startedAt });
    }

    if (req.method !== 'POST') {
      return sendJson(res, 404, { error: 'Not found' });
    }

    if (url.pathname !== '/v1/chat/completions' && url.pathname !== '/responses') {
      return sendJson(res, 404, { error: 'Unknown OpenResponses path' });
    }

    const body = await readJson(req);
    const sessionKey = String(req.headers['x-openclaw-session-key'] ?? '');
    const agentId = String(req.headers['x-openclaw-agent-id'] ?? '');
    const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : 'openclaw:main';
    const input = typeof body?.input === 'string' ? body.input : '';
    const text = buildMockReply(input);

    return sendJson(res, 200, {
      id: `mock-${Date.now()}`,
      object: 'response',
      created: Math.floor(Date.now() / 1000),
      model,
      metadata: {
        mock: true,
        session_key: sessionKey || null,
        agent_id: agentId || null,
      },
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        },
      ],
    });
  });

  server.listen(port, host, () => {
    console.log(`[mock-openresponses] listening on http://${host}:${port}`);
    console.log('[mock-openresponses] endpoints: POST /v1/chat/completions, POST /responses');
  });
}

main().catch((err) => {
  console.error('[mock-openresponses] fatal:', err);
  process.exit(1);
});
