import { useEffect, useMemo, useRef, useState } from 'react';
import { createResponse } from '../../api/openclaw';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';

type UiMsg = { id: string; role: 'user' | 'assistant'; content: string; ts: number };

function lsKey(taskId: string, agentOpenclawId?: string | null) {
  // Deterministic per task+agent profile.
  return `dzzenos.taskchat.v2.${taskId}.${agentOpenclawId ?? 'unbound'}`;
}

function nowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function TaskChat({
  taskId,
  taskTitle,
  agentOpenclawId,
  model,
  disabled,
  disabledReason,
}: {
  taskId: string;
  taskTitle: string;
  agentOpenclawId?: string | null;
  model?: string | null;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const key = useMemo(() => lsKey(taskId, agentOpenclawId), [taskId, agentOpenclawId]);
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        setMsgs([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setMsgs(parsed.slice(-200));
      else setMsgs([]);
    } catch {
      setMsgs([]);
    }
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(msgs.slice(-200)));
    } catch {
      // ignore
    }
  }, [key, msgs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy || disabled) return;

    setErr(null);
    setBusy(true);

    const userMsg: UiMsg = { id: nowId(), role: 'user', content: text, ts: Date.now() };
    setInput('');
    setMsgs((m) => [...m, userMsg]);

    try {
      const reply = await createResponse({
        sessionKey: key,
        text,
        agentId: agentOpenclawId ?? undefined,
        model: model ?? undefined,
      });
      const a: UiMsg = { id: nowId(), role: 'assistant', content: reply.trim(), ts: Date.now() };
      setMsgs((m) => [...m, a]);
    } catch (e: any) {
      setErr(
        String(e?.message ?? e) ||
          'Failed to reach OpenClaw OpenResponses endpoint. See docs: enable gateway.http.endpoints.responses.enabled and use /v1/responses.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Chat</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {taskTitle} • model: <span className="text-foreground">{model ?? 'openclaw:main'}</span>
        </div>
        <div className="mt-2 max-h-[45vh] overflow-auto rounded-lg border border-border/70 bg-background/40 p-3">
          {msgs.length ? (
            <div className="grid gap-3">
              {msgs.map((m) => (
                <div key={m.id} className="grid gap-1">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {m.role === 'user' ? 'You' : 'Assistant'}
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{m.content}</div>
                </div>
              ))}
              {busy ? <div className="text-sm text-muted-foreground">Thinking…</div> : null}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No messages yet. Ask something about this task.</div>
          )}
        </div>
      </div>

      {err ? <InlineAlert>{err}</InlineAlert> : null}
      {disabled ? <InlineAlert>{disabledReason ?? 'Attach an enabled orchestrator agent to start pre-run chat.'}</InlineAlert> : null}

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Write a message…"
          rows={3}
          disabled={disabled || busy}
          className="min-h-[72px] w-full resize-none rounded-md border border-input bg-background/40 px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button disabled={busy || !input.trim() || !!disabled} onClick={send}>
          Send
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">Ctrl/⌘ + Enter to send</div>
    </div>
  );
}
