import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Board, Task, TaskStatus } from '../../api/types';
import { createBoard } from '../../api/queries';
import { cn } from '../../lib/cn';
import { formatUpdatedAt } from './taskTime';

import { PageHeader } from '../Layout/PageHeader';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { TaskBoard } from './TaskBoard';
import { TaskBoardSkeleton } from './TaskBoardSkeleton';
import { NewTask } from './NewTask';

export function KanbanPage({
  boards,
  boardsLoading,
  boardsError,
  selectedBoardId,
  onSelectBoard,
  tasks,
  tasksLoading,
  tasksError,
  selectedTaskId,
  onSelectTask,
  onMoveTask,
  moveDisabled,
  onReorder,
  onQuickCreate,
  onCreateTask,
  createTaskError,
  moveError,
  reorderError,
}: {
  boards: Board[];
  boardsLoading: boolean;
  boardsError: unknown | null;
  selectedBoardId: string | null;
  onSelectBoard: (id: string) => void;
  tasks: Task[];
  tasksLoading: boolean;
  tasksError: unknown | null;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onMoveTask: (id: string, status: TaskStatus) => void;
  moveDisabled: boolean;
  onReorder: (status: TaskStatus, orderedIds: string[]) => void;
  onQuickCreate: (status: TaskStatus, title: string) => Promise<void> | void;
  onCreateTask: (title: string) => Promise<void> | void;
  createTaskError: unknown | null;
  moveError: unknown | null;
  reorderError: unknown | null;
}) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createM = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Board name is required');
      return createBoard({ name: trimmed, description: description.trim() || null });
    },
    onSuccess: async (board) => {
      await qc.invalidateQueries({ queryKey: ['boards'] });
      onSelectBoard(board.id);
      setCreateOpen(false);
      setName('');
      setDescription('');
    },
  });

  const sortedBoards = useMemo(() => {
    return [...boards].sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    });
  }, [boards]);

  const hasBoards = sortedBoards.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Kanban"
        subtitle="Boards and task execution"
        actions={
          <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
            <Dialog.Trigger asChild>
              <Button variant="secondary">New board</Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/70 bg-surface-1/90 p-5 shadow-popover backdrop-blur">
                <Dialog.Title className="text-sm font-semibold text-foreground">Create board</Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                  Organize tasks by workflow. You can rename it later.
                </Dialog.Description>

                <div className="mt-4 grid gap-3">
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">Name</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Startup launch" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">Description</label>
                    <textarea
                      className="min-h-[90px] w-full resize-none rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground outline-none"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What this board is for"
                    />
                  </div>
                  {createM.isError ? <InlineAlert>{String(createM.error)}</InlineAlert> : null}
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => createM.mutate()} disabled={createM.isPending || !name.trim()}>
                    {createM.isPending ? 'Creating…' : 'Create board'}
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {boardsLoading ? (
          Array.from({ length: 6 }).map((_, idx) => <Skeleton key={idx} className="h-[120px] w-full" />)
        ) : boardsError ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <InlineAlert>{String(boardsError)}</InlineAlert>
          </div>
        ) : (
          <>
            {sortedBoards.map((board) => {
              const active = board.id === selectedBoardId;
              return (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => onSelectBoard(board.id)}
                  className={cn(
                    'group flex w-full flex-col gap-2 rounded-xl border border-border/70 bg-surface-1/70 p-4 text-left shadow-panel transition',
                    'hover:-translate-y-0.5 hover:bg-surface-2/70',
                    active && 'border-primary/60 bg-surface-2/80 ring-1 ring-primary/40'
                  )}
                >
                  <div className="text-sm font-semibold tracking-tight text-foreground">{board.name}</div>
                  <div className="max-h-10 overflow-hidden text-xs text-muted-foreground">
                    {board.description || 'No description yet.'}
                  </div>
                  <div className="mt-auto text-[11px] text-muted-foreground">
                    Updated {formatUpdatedAt(board.updated_at)}
                  </div>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className={cn(
                'flex min-h-[120px] w-full items-center justify-center rounded-xl border border-dashed border-border/70 bg-surface-1/40 text-sm text-muted-foreground transition',
                'hover:border-primary/60 hover:text-foreground'
              )}
            >
              + Create board
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Board tasks</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedBoardId ? 'Move cards to advance the work.' : 'Select a board to see tasks.'}
            </p>
          </div>
          <div className="w-full sm:max-w-md">
            {selectedBoardId ? (
              <NewTask onCreate={onCreateTask} />
            ) : (
              <div className="rounded-md border border-border/70 bg-surface-1/50 px-3 py-2 text-xs text-muted-foreground">
                Select a board to create tasks.
              </div>
            )}
          </div>
        </div>

        {createTaskError ? <InlineAlert>{String(createTaskError)}</InlineAlert> : null}
        {moveError || reorderError ? <InlineAlert>{String(moveError ?? reorderError)}</InlineAlert> : null}

        {!hasBoards ? (
          <EmptyState title="No boards yet" subtitle="Create your first board to start." />
        ) : !selectedBoardId ? (
          <EmptyState title="Select a board" subtitle="Choose a board above to view tasks." />
        ) : tasksLoading ? (
          <TaskBoardSkeleton />
        ) : tasksError ? (
          <InlineAlert>{String(tasksError)}</InlineAlert>
        ) : tasks.length === 0 ? (
          <EmptyState title="No tasks yet" subtitle="Create one with the input above." />
        ) : (
          <TaskBoard
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            onMoveTask={onMoveTask}
            moveDisabled={moveDisabled}
            onReorder={onReorder}
            onQuickCreate={onQuickCreate}
          />
        )}
      </div>
    </div>
  );
}
