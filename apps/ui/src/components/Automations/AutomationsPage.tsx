import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { Spinner } from '../ui/Spinner';
import { Skeleton } from '../ui/Skeleton';

import type { Automation } from '../../api/types';
import { createAutomation, getAutomation, listAutomations, runAutomation, updateAutomation } from '../../api/queries';

const SAMPLE_NODES: Node[] = [
  {
    id: 'trigger',
    position: { x: 0, y: 40 },
    data: { label: 'Trigger: Manual' },
    type: 'input',
  },
  {
    id: 'agent',
    position: { x: 240, y: 40 },
    data: { label: 'Agent: DzzenOS' },
  },
  {
    id: 'done',
    position: { x: 520, y: 40 },
    data: { label: 'Done' },
    type: 'output',
  },
];

const SAMPLE_EDGES: Edge[] = [
  { id: 'e1', source: 'trigger', target: 'agent' },
  { id: 'e2', source: 'agent', target: 'done' },
];

function safeParseGraph(graph_json: string | null | undefined): { nodes: Node[]; edges: Edge[] } {
  if (!graph_json) return { nodes: SAMPLE_NODES, edges: SAMPLE_EDGES };
  try {
    const parsed = JSON.parse(graph_json);
    const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : SAMPLE_NODES;
    const edges = Array.isArray(parsed?.edges) ? parsed.edges : SAMPLE_EDGES;
    return { nodes, edges };
  } catch {
    return { nodes: SAMPLE_NODES, edges: SAMPLE_EDGES };
  }
}

export function AutomationsPage() {
  return (
    <ReactFlowProvider>
      <AutomationsPageInner />
    </ReactFlowProvider>
  );
}

function AutomationsPageInner() {
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');

  const listQ = useQuery({ queryKey: ['automations'], queryFn: listAutomations });

  const selectedQ = useQuery({
    queryKey: ['automation', selectedId],
    queryFn: () => {
      if (!selectedId) return Promise.resolve(null as Automation | null);
      return getAutomation(selectedId);
    },
    enabled: !!selectedId,
  });

  const initialGraph = useMemo(() => safeParseGraph(selectedQ.data?.graph_json), [selectedQ.data?.graph_json]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);

  // When selection changes, load graph into ReactFlow state.
  useEffect(() => {
    const g = safeParseGraph(selectedQ.data?.graph_json);
    setNodes(g.nodes);
    setEdges(g.edges);
    setName(selectedQ.data?.name ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQ.data?.id]);

  // Pick first automation if exists.
  useEffect(() => {
    if (selectedId) return;
    const first = listQ.data?.[0];
    if (first) setSelectedId(first.id);
  }, [listQ.data, selectedId]);

  const createM = useMutation({
    mutationFn: async () =>
      createAutomation({
        name: name.trim() || 'Untitled automation',
        graph: { nodes, edges },
      }),
    onSuccess: async (a) => {
      await qc.invalidateQueries({ queryKey: ['automations'] });
      setSelectedId(a.id);
    },
  });

  const saveM = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('No automation selected');
      return updateAutomation(selectedId, { name: name.trim() || 'Untitled automation', graph: { nodes, edges } });
    },
    onSuccess: async (a) => {
      await qc.invalidateQueries({ queryKey: ['automations'] });
      await qc.invalidateQueries({ queryKey: ['automation', a.id] });
    },
  });

  const runM = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('No automation selected');
      return runAutomation(selectedId);
    },
  });

  const dirtyHint = selectedId ? 'Changes are local until you click Save.' : 'Save as new to persist in SQLite.';
  const loadingList = listQ.isLoading && (listQ.data ?? []).length === 0;
  const loadingGraph = selectedQ.isLoading && !selectedQ.data && !!selectedId;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Automations</h1>
          <p className="mt-1 text-sm text-muted-foreground">React Flow skeleton (save/load via /automations).</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setSelectedId(null);
              setName('');
              setNodes(SAMPLE_NODES);
              setEdges(SAMPLE_EDGES);
            }}
          >
            New
          </Button>
          <Button onClick={async () => createM.mutateAsync()} disabled={createM.isPending}>
            {createM.isPending ? 'Saving…' : 'Save as new'}
          </Button>
          <Button
            variant="secondary"
            onClick={async () => saveM.mutateAsync()}
            disabled={!selectedId || saveM.isPending}
            title={selectedId ? undefined : 'Select or create an automation first'}
          >
            {saveM.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant="secondary"
            onClick={async () => runM.mutateAsync()}
            disabled={!selectedId || runM.isPending}
            title={selectedId ? undefined : 'Select or create an automation first'}
          >
            {runM.isPending ? 'Starting…' : 'Run now'}
          </Button>
        </div>
      </div>

      {(listQ.isError || selectedQ.isError || createM.isError || saveM.isError || runM.isError) && (
        <InlineAlert>
          {String(listQ.error ?? selectedQ.error ?? createM.error ?? saveM.error ?? runM.error)}
        </InlineAlert>
      )}

      <div className="grid w-full gap-4 lg:grid-cols-[320px,1fr]">
        <div className="rounded-xl border border-border/70 bg-surface-1/70 p-4 shadow-panel backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Library</div>
            {listQ.isLoading ? <Spinner label="Loading…" /> : null}
          </div>

          <div className="mt-3">
            {loadingList ? (
              <div className="grid gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-3 w-40" />
              </div>
            ) : (
              <>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <input
                  className="mt-1 w-full rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Untitled automation"
                />
                <div className="mt-2 text-xs text-muted-foreground">{dirtyHint}</div>
              </>
            )}
          </div>

          <div className="mt-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saved automations</div>
            <div className="mt-2 flex flex-col gap-1">
              {loadingList ? (
                <div className="grid gap-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <Skeleton key={idx} className="h-9 w-full" />
                  ))}
                </div>
              ) : (listQ.data ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No saved automations yet.</div>
              ) : (
                (listQ.data ?? []).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className={
                      'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ' +
                      (a.id === selectedId
                        ? 'border-primary/40 bg-surface-2/60'
                        : 'border-border/70 hover:bg-surface-2/50')
                    }
                  >
                    <span className="truncate">{a.name}</span>
                    <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">{a.id.slice(0, 6)}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Palette (stub)</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <PaletteItem label="Trigger" />
              <PaletteItem label="Agent" />
              <PaletteItem label="HTTP" />
              <PaletteItem label="If/Else" />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Drag/drop wiring will come later; this is a minimal skeleton.
            </div>
          </div>
        </div>

        <div className="min-h-[520px] overflow-hidden rounded-xl border border-border/70 bg-surface-1/70 shadow-panel backdrop-blur">
          <div className="h-[calc(100dvh-14rem)] min-h-[520px]">
            {loadingGraph ? (
              <div className="flex h-full items-center justify-center">
                <Skeleton className="h-[320px] w-[80%]" />
              </div>
            ) : (
              <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView>
                <MiniMap />
                <Controls />
                <Background />
              </ReactFlow>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaletteItem({ label }: { label: string }) {
  return (
    <div className="select-none rounded-md border border-border/70 bg-surface-2/50 px-3 py-2 text-sm text-foreground/90">
      {label}
    </div>
  );
}
