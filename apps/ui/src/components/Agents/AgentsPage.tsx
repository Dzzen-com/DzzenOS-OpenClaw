import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Agent } from '../../api/types';
import { createAgent, deleteAgent, duplicateAgent, listAgents, patchAgent, resetAgent } from '../../api/queries';

import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { InlineAlert } from '../ui/InlineAlert';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';

import { AgentDrawer } from './AgentDrawer';

function getOpenClawHref(): string {
  const envOpenclawPath = (import.meta as any).env?.VITE_OPENCLAW_PATH as string | undefined;
  const derivedPath = (() => {
    if (envOpenclawPath && envOpenclawPath.trim()) return envOpenclawPath.trim();
    const host = window?.location?.hostname ?? '';
    if (host === 'localhost' || host === '127.0.0.1') return '/';
    return '/openclaw';
  })();
  const openclawHref = derivedPath.startsWith('http')
    ? derivedPath
    : derivedPath.startsWith('/')
      ? derivedPath
      : `/${derivedPath}`;
  return openclawHref;
}

function normalizeText(v: unknown) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

function matchesSearch(agent: Agent, q: string) {
  if (!q) return true;
  const hay = [
    agent.display_name,
    agent.description ?? '',
    agent.category ?? '',
    ...(agent.tags ?? []),
  ]
    .map((s) => normalizeText(s))
    .join(' ');
  return hay.includes(q);
}

function sortAgents(a: Agent, b: Agent) {
  const ao = Number(a.sort_order ?? 0) || 0;
  const bo = Number(b.sort_order ?? 0) || 0;
  if (ao !== bo) return ao - bo;
  return String(a.display_name ?? '').localeCompare(String(b.display_name ?? ''));
}

export function AgentsPage() {
  const qc = useQueryClient();
  const openclawHref = useMemo(() => getOpenClawHref(), []);

  const agentsQ = useQuery({ queryKey: ['agents'], queryFn: listAgents });

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('edit');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedAgent: Agent | null = useMemo(() => {
    if (!selectedId) return null;
    return (agentsQ.data ?? []).find((a) => a.id === selectedId) ?? null;
  }, [agentsQ.data, selectedId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const a of agentsQ.data ?? []) {
      const c = (a.category ?? '').trim();
      if (c) set.add(c);
    }
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [agentsQ.data]);

  const q = normalizeText(search);
  const filtered = useMemo(() => {
    const list = agentsQ.data ?? [];
    return list
      .filter((a) => matchesSearch(a, q))
      .filter((a) => (category === 'all' ? true : (a.category ?? 'general') === category));
  }, [agentsQ.data, category, q]);

  const presets = useMemo(() => filtered.filter((a) => a.preset_key).sort(sortAgents), [filtered]);
  const customs = useMemo(() => filtered.filter((a) => !a.preset_key).sort(sortAgents), [filtered]);

  const patchM = useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<Agent> }) => patchAgent(vars.id, vars.patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const createM = useMutation({
    mutationFn: async (input: Partial<Agent> & { display_name: string; openclaw_agent_id: string }) => createAgent(input),
    onSuccess: async (a) => {
      await qc.invalidateQueries({ queryKey: ['agents'] });
      setSelectedId(a.id);
      setDrawerMode('edit');
      setDrawerOpen(true);
    },
  });

  const resetM = useMutation({
    mutationFn: async (id: string) => resetAgent(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const duplicateM = useMutation({
    mutationFn: async (id: string) => duplicateAgent(id),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: ['agents'] });
      setSelectedId(id);
      setDrawerMode('edit');
      setDrawerOpen(true);
    },
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => deleteAgent(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agents'] });
      setDrawerOpen(false);
      setSelectedId(null);
    },
  });

  const globalError =
    agentsQ.isError || patchM.isError || createM.isError || resetM.isError || duplicateM.isError || deleteM.isError
      ? String(
          agentsQ.error ?? patchM.error ?? createM.error ?? resetM.error ?? duplicateM.error ?? deleteM.error
        )
      : null;

  const busy = patchM.isPending || createM.isPending || resetM.isPending || duplicateM.isPending || deleteM.isPending;
  const loading = agentsQ.isLoading && (agentsQ.data ?? []).length === 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Agent Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Presets + custom profiles. Assign agents in Kanban/Automations (not here).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-64">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search agents…" />
          </div>
          <select
            className="h-9 rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={loading}
            title="Category"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All categories' : c}
              </option>
            ))}
          </select>
          <Button
            onClick={() => {
              setSelectedId(null);
              setDrawerMode('create');
              setDrawerOpen(true);
            }}
          >
            New agent
          </Button>
        </div>
      </div>

      {globalError ? <InlineAlert>{globalError}</InlineAlert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Presets</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <GridSkeleton count={6} />
          ) : presets.length === 0 ? (
            <EmptyState
              title="No presets found"
              subtitle="Presets are seeded when the DB is empty. Try clearing your DB or create a custom agent."
            />
          ) : (
            <AgentGrid
              agents={presets}
              onConfigure={(id) => {
                setSelectedId(id);
                setDrawerMode('edit');
                setDrawerOpen(true);
              }}
              onToggleEnabled={(id, enabled) => patchM.mutate({ id, patch: { enabled } })}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Custom</CardTitle>
          <div className="text-xs text-muted-foreground">{customs.length} agents</div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <GridSkeleton count={3} />
          ) : customs.length === 0 ? (
            <EmptyState
              title="No custom agents yet"
              subtitle="Create a custom profile to override prompts/skills and bind it to an OpenClaw agent id."
            />
          ) : (
            <AgentGrid
              agents={customs}
              onConfigure={(id) => {
                setSelectedId(id);
                setDrawerMode('edit');
                setDrawerOpen(true);
              }}
              onToggleEnabled={(id, enabled) => patchM.mutate({ id, patch: { enabled } })}
            />
          )}
        </CardContent>
      </Card>

      <AgentDrawer
        open={drawerOpen}
        agent={drawerMode === 'edit' ? selectedAgent : null}
        mode={drawerMode}
        openclawHref={openclawHref}
        busy={busy}
        error={globalError}
        onOpenChange={(o) => setDrawerOpen(o)}
        onCreate={(input) => createM.mutate(input)}
        onSave={(patch) => {
          if (!selectedAgent?.id) return;
          patchM.mutate({ id: selectedAgent.id, patch });
        }}
        onReset={() => {
          if (!selectedAgent?.id) return;
          resetM.mutate(selectedAgent.id);
        }}
        onDuplicate={() => {
          if (!selectedAgent?.id) return;
          duplicateM.mutate(selectedAgent.id);
        }}
        onDelete={() => {
          if (!selectedAgent?.id) return;
          deleteM.mutate(selectedAgent.id);
        }}
      />
    </div>
  );
}

function GridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="rounded-xl border border-border/70 bg-surface-2/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-52" />
              <Skeleton className="mt-2 h-3 w-44" />
            </div>
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentGrid({
  agents,
  onConfigure,
  onToggleEnabled,
}: {
  agents: Agent[];
  onConfigure: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((a) => (
        <AgentCard
          key={a.id}
          agent={a}
          onConfigure={() => onConfigure(a.id)}
          onToggleEnabled={(enabled) => onToggleEnabled(a.id, enabled)}
        />
      ))}
    </div>
  );
}

function AgentCard({
  agent,
  onConfigure,
  onToggleEnabled,
}: {
  agent: Agent;
  onConfigure: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const tags = (agent.tags ?? []).slice(0, 4);
  return (
    <div className="rounded-xl border border-border/70 bg-surface-2/40 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{agent.emoji ?? '🤖'}</span>
            <div className="truncate text-sm font-semibold tracking-tight text-foreground">{agent.display_name}</div>
          </div>
          <div className="mt-2 max-h-8 overflow-hidden text-xs text-muted-foreground">
            {agent.description?.trim() ? agent.description : 'No description'}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
              {agent.category ?? 'general'}
            </Badge>
            {tags.map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="h-5 rounded-md px-2 text-[10px] tracking-wide text-muted-foreground"
              >
                {t}
              </Badge>
            ))}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Used in <span className="text-foreground/80">{agent.assigned_task_count ?? 0}</span> tasks
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Button size="sm" variant="secondary" onClick={onConfigure}>
            Configure
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={agent.enabled}
              onChange={(e) => onToggleEnabled(e.target.checked)}
            />
            Enabled
          </label>
        </div>
      </div>
    </div>
  );
}
