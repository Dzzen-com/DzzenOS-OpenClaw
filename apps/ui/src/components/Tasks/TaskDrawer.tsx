import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Task, TaskStatus } from '../../api/types';
import { listTaskRuns, patchTask, simulateRun } from '../../api/queries';
import { statusLabel } from './status';
import { shortId } from './taskId';
import { formatUpdatedAt } from './taskTime';
import { InlineAlert } from '../ui/InlineAlert';
import { Button } from '../ui/Button';

const STATUS: TaskStatus[] = ['todo', 'doing', 'blocked', 'done'];

export function TaskDrawer({
  task,
  open,
  onOpenChange,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();

  const patchM = useMutation({
    mutationFn: async (vars: { id: string; status: TaskStatus }) => patchTask(vars.id, { status: vars.status }),
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ['tasks', t.board_id] });
    },
  });

  const runsQ = useQuery({
    queryKey: ['runs', task?.id],
    queryFn: () => listTaskRuns(task!.id),
    enabled: open && !!task?.id,
    refetchInterval: (q) => {
      const data = q.state.data as any[] | undefined;
      const running = (data ?? []).some((r) => r.status === 'running');
      return running ? 500 : false;
    },
  });

  const simulateM = useMutation({
    mutationFn: async (id: string) => simulateRun(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['runs', task?.id] });
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/45 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed right-0 top-0 h-dvh w-full max-w-xl border-l border-border/70 bg-card p-6 shadow-popover outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold tracking-tight">
                {task ? `${shortId(task.id)} · ${task.title}` : 'Task'}
              </Dialog.Title>
              <div className="mt-1 text-sm text-muted-foreground">Local task</div>
            </div>
            <Dialog.Close asChild aria-label="Close">
              <Button variant="secondary">Close</Button>
            </Dialog.Close>
          </div>

          {patchM.isError ? (
            <div className="mt-4">
              <InlineAlert>{String(patchM.error)}</InlineAlert>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3">
            <Row label="Status">
              <select
                value={task?.status ?? 'todo'}
                disabled={!task || patchM.isPending}
                onChange={(e) => {
                  if (!task) return;
                  patchM.mutate({ id: task.id, status: e.target.value as TaskStatus });
                }}
                className="h-9 rounded-md border border-input bg-background/40 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {STATUS.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Updated">
              <div className="text-sm text-foreground">{task ? formatUpdatedAt(task.updated_at) : '—'}</div>
            </Row>

            <Row label="Created">
              <div className="text-sm text-foreground">{task ? formatUpdatedAt(task.created_at) : '—'}</div>
            </Row>
          </div>

          <div className="mt-6 rounded-xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</div>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed text-foreground">
              {task?.description?.trim() ? task.description : '—'}
            </p>
          </div>

          <div className="mt-6 text-xs text-muted-foreground">PATCH /tasks/:id (status)</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
