import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sendTaskChat, getTaskChat } from '../../api/queries';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import type { TaskMessage } from '../../api/types';

export function TaskChat({ taskId, taskTitle }: { taskId: string; taskTitle: string }) {
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const chatQ = useQuery({
    queryKey: ['task-chat', taskId],
    queryFn: () => getTaskChat(taskId),
    enabled: !!taskId,
  });

  const sendM = useMutation({
    mutationFn: async (text: string) => sendTaskChat(taskId, { text }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task-chat', taskId] });
    },
    onError: (e: any) => setErr(String(e?.message ?? e)),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [chatQ.data?.length, sendM.isPending]);

  const messages = (chatQ.data ?? []) as TaskMessage[];

  async function send() {
    const text = input.trim();
    if (!text || sendM.isPending) return;
    setErr(null);
    setInput('');
    await sendM.mutateAsync(text);
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-border/70 bg-surface-2/40 p-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Chat</div>
        <div className="mt-2 max-h-[45vh] overflow-auto rounded-lg border border-border/70 bg-surface-1/60 p-3">
          {chatQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : messages.length ? (
            <div className="grid gap-3">
              {messages.map((m) => (
                <div key={m.id} className="grid gap-1">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Assistant' : 'System'}
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{m.content}</div>
                </div>
              ))}
              {sendM.isPending ? <div className="text-sm text-muted-foreground">Thinking…</div> : null}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No messages yet. Ask something about this task.</div>
          )}
        </div>
      </div>

      {err ? <InlineAlert>{err}</InlineAlert> : null}

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask the agent about "${taskTitle}"…`}
          rows={3}
          className="min-h-[72px] w-full resize-none rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button disabled={sendM.isPending || !input.trim()} onClick={send}>
          Send
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">Ctrl/⌘ + Enter to send</div>
    </div>
  );
}
