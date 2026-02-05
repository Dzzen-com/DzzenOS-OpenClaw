import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { listAgents, updateAgents } from '../../api/queries';
import type { Agent } from '../../api/types';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { InlineAlert } from '../ui/InlineAlert';
import { Skeleton } from '../ui/Skeleton';

function newAgent(): Agent {
  return {
    id: crypto.randomUUID(),
    display_name: '',
    emoji: null,
    openclaw_agent_id: '',
    enabled: true,
    role: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function AgentsPage() {
  const listQ = useQuery({ queryKey: ['agents'], queryFn: listAgents });
  const [draft, setDraft] = useState<Agent[]>([]);

  useEffect(() => {
    if (listQ.data) setDraft(listQ.data);
  }, [listQ.data]);

  const saveM = useMutation({
    mutationFn: async () => updateAgents(draft),
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Agent Library</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDraft((prev) => [...prev, newAgent()])}
            >
              Add agent
            </Button>
            <Button size="sm" onClick={() => saveM.mutate()} disabled={saveM.isPending}>
              {saveM.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {listQ.isError ? <InlineAlert>{String(listQ.error)}</InlineAlert> : null}
          <div className="grid gap-3">
            {listQ.isLoading && draft.length === 0 ? (
              <div className="grid gap-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="rounded-lg border border-border/70 bg-surface-2/40 p-3">
                    <div className="grid gap-2 sm:grid-cols-[120px,1fr]">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-6 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              draft.map((agent, idx) => (
                <div key={agent.id} className="rounded-lg border border-border/70 bg-surface-2/40 p-3">
                  <div className="grid gap-2 sm:grid-cols-[120px,1fr]">
                    <label className="text-xs text-muted-foreground">Display name</label>
                    <input
                      className="rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground"
                      value={agent.display_name}
                      onChange={(e) =>
                        setDraft((prev) => prev.map((a, i) => (i === idx ? { ...a, display_name: e.target.value } : a)))
                      }
                      placeholder="Agent name"
                    />

                    <label className="text-xs text-muted-foreground">OpenClaw agent id</label>
                    <input
                      className="rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground"
                      value={agent.openclaw_agent_id}
                      onChange={(e) =>
                        setDraft((prev) => prev.map((a, i) => (i === idx ? { ...a, openclaw_agent_id: e.target.value } : a)))
                      }
                      placeholder="main"
                    />

                    <label className="text-xs text-muted-foreground">Role</label>
                    <input
                      className="rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground"
                      value={agent.role ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => prev.map((a, i) => (i === idx ? { ...a, role: e.target.value } : a)))
                      }
                      placeholder="orchestrator / builder / reviewer"
                    />

                    <label className="text-xs text-muted-foreground">Emoji</label>
                    <input
                      className="rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground"
                      value={agent.emoji ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => prev.map((a, i) => (i === idx ? { ...a, emoji: e.target.value } : a)))
                      }
                      placeholder=":zap:"
                    />

                    <label className="text-xs text-muted-foreground">Enabled</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={agent.enabled}
                        onChange={(e) =>
                          setDraft((prev) => prev.map((a, i) => (i === idx ? { ...a, enabled: e.target.checked } : a)))
                        }
                      />
                      <span className="text-xs text-muted-foreground">Active</span>
                    </div>
                  </div>
                </div>
              ))
            )}
            {!listQ.isLoading && draft.length === 0 ? (
              <div className="text-sm text-muted-foreground">No agents configured yet.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
