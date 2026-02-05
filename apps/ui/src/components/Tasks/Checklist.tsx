import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { StatusDot } from '../ui/StatusDot';
import { cn } from '../../lib/cn';
import {
  createChecklistItem,
  deleteChecklistItem,
  listChecklist,
  updateChecklistItem,
} from '../../api/queries';
import type { TaskChecklistItem } from '../../api/types';

export function Checklist({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');

  const listQ = useQuery({
    queryKey: ['checklist', taskId],
    queryFn: () => listChecklist(taskId),
    enabled: !!taskId,
  });

  const createM = useMutation({
    mutationFn: async (title: string) => createChecklistItem(taskId, { title }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['checklist', taskId] });
      setDraft('');
    },
  });

  const updateM = useMutation({
    mutationFn: async (input: { id: string; title?: string; state?: string }) =>
      updateChecklistItem(taskId, input.id, { title: input.title, state: input.state }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['checklist', taskId] });
    },
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => deleteChecklistItem(taskId, id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['checklist', taskId] });
    },
  });

  const items = listQ.data ?? [];
  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.state === 'done').length;
    const doing = items.filter((i) => i.state === 'doing').length;
    return { total, done, doing };
  }, [items]);

  function addItem() {
    const title = draft.trim();
    if (!title || createM.isPending) return;
    createM.mutate(title);
  }

  return (
    <div className="rounded-xl border border-border/70 bg-surface-2/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Checklist</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {stats.done}/{stats.total} done • {stats.doing} in progress
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={addItem} disabled={!draft.trim() || createM.isPending}>
          Add
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {listQ.isLoading ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-surface-1/60 px-3 py-3 text-xs text-muted-foreground">
            Loading checklist…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-surface-1/60 px-3 py-3 text-xs text-muted-foreground">
            No checklist items yet.
          </div>
        ) : (
          items.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              busy={updateM.isPending || deleteM.isPending}
              onChange={(next) => updateM.mutate({ id: item.id, ...next })}
              onDelete={() => deleteM.mutate(item.id)}
            />
          ))
        )}
      </div>

      <div className="mt-3">
        <input
          className="w-full rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground"
          placeholder="Add a checklist item…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addItem();
            }
          }}
        />
      </div>
    </div>
  );
}

function ChecklistRow({
  item,
  busy,
  onChange,
  onDelete,
}: {
  item: TaskChecklistItem;
  busy: boolean;
  onChange: (next: { title?: string; state?: string }) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(item.title);

  useEffect(() => {
    setTitle(item.title);
  }, [item.title]);

  const tone = item.state === 'done' ? 'success' : item.state === 'doing' ? 'warning' : 'muted';

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface-1/60 px-3 py-2">
      <StatusDot tone={tone} className="mt-1" />
      <select
        className="h-7 rounded-md border border-input/60 bg-surface-2/60 px-2 text-xs text-foreground"
        value={item.state}
        onChange={(e) => onChange({ state: e.target.value })}
        disabled={busy}
      >
        <option value="todo">Todo</option>
        <option value="doing">In progress</option>
        <option value="done">Done</option>
      </select>
      <input
        className={cn(
          'min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none',
          item.state === 'done' && 'line-through text-muted-foreground',
        )}
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const next = title.trim();
          if (next && next !== item.title) onChange({ title: next });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const next = title.trim();
            if (next && next !== item.title) onChange({ title: next });
          }
        }}
      />
      <IconButton size="sm" variant="ghost" aria-label="Remove item" onClick={onDelete} disabled={busy}>
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M5.5 5.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </IconButton>
    </div>
  );
}
