import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Board, Task, TaskStatus } from '../../api/types';
import { createBoard, patchTask } from '../../api/queries';
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

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'ideas', label: 'Ideas' },
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'In progress' },
  { value: 'review', label: 'Review' },
  { value: 'release', label: 'Release' },
  { value: 'done', label: 'Done' },
  { value: 'archived', label: 'Archived' },
];

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
  const [quickTitle, setQuickTitle] = useState('');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const quickRef = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

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

  const bulkMoveM = useMutation({
    mutationFn: async (input: { ids: string[]; status: TaskStatus }) => {
      await Promise.all(input.ids.map((id) => patchTask(id, { status: input.status })));
      return { ok: true };
    },
    onSuccess: async () => {
      if (selectedBoardId) {
        await qc.invalidateQueries({ queryKey: ['tasks', selectedBoardId] });
      }
    },
  });

  const sortedBoards = useMemo(() => {
    return [...boards].sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    });
  }, [boards]);

  const hasBoards = sortedBoards.length > 0;
  const selectedBoard = sortedBoards.find((b) => b.id === selectedBoardId) ?? null;

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (!showArchived && t.status === 'archived') return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q);
    });
  }, [tasks, search, showArchived]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleIds = useMemo(() => filteredTasks.map((t) => t.id), [filteredTasks]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  useEffect(() => {
    if (!selectionMode) {
      setSelectedIds([]);
    }
  }, [selectionMode]);

  useEffect(() => {
    const visible = new Set(visibleIds);
    setSelectedIds((prev) => prev.filter((id) => visible.has(id)));
  }, [visibleIds]);

  useEffect(() => {
    const isTyping = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(document.activeElement)) return;
      if (e.key.toLowerCase() === 'n') {
        quickRef.current?.focus();
        e.preventDefault();
      }
      if ((e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
        searchRef.current?.focus();
        e.preventDefault();
      }
      if (e.key === 'Escape' && selectionMode) {
        setSelectionMode(false);
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectionMode]);

  useEffect(() => {
    const key = `dzzenos.kanban.scroll.${selectedBoardId ?? 'none'}`;
    const saved = sessionStorage.getItem(key);
    if (saved) {
      const top = Number(saved);
      if (Number.isFinite(top)) window.scrollTo({ top, behavior: 'auto' });
    }
    let raf: number | null = null;
    const onScroll = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(() => {
        sessionStorage.setItem(key, String(window.scrollY));
        raf = null;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf != null) window.cancelAnimationFrame(raf);
    };
  }, [selectedBoardId]);

  const handleQuickAdd = async () => {
    const trimmed = quickTitle.trim();
    if (!trimmed) return;
    if (!selectedBoardId) {
      setCreateOpen(true);
      return;
    }
    await onCreateTask(trimmed);
    setQuickTitle('');
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(visibleIds);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Kanban"
        subtitle="Boards and task execution"
        actions={
          <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
            <Dialog.Trigger asChild>
              <Button>Create board</Button>
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

      <div className="rounded-2xl border border-border/70 bg-surface-1/70 p-3 shadow-panel">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              ref={quickRef}
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleQuickAdd();
                }
              }}
              placeholder="Capture a quick idea… (Press N)"
            />
          </div>
          <Button onClick={handleQuickAdd} disabled={!quickTitle.trim()}>
            Add idea
          </Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">Fast capture goes to Ideas for the selected board.</div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Boards</div>
          <div className="mt-1 text-sm text-muted-foreground">Pick a board or create a new workspace for tasks.</div>
        </div>

        {!boardsLoading && !boardsError && !hasBoards ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-surface-1/60 p-6 text-sm text-muted-foreground shadow-panel">
            <div className="text-base font-semibold text-foreground">Create your first board</div>
            <div className="mt-2 max-w-lg text-sm text-muted-foreground">
              Boards keep tasks grouped by workflow (product, content, ops). You can edit the name and description later.
            </div>
            <div className="mt-4">
              <Button onClick={() => setCreateOpen(true)}>Create board</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {boardsLoading ? (
              Array.from({ length: 6 }).map((_, idx) => <Skeleton key={idx} className="h-[120px] w-full" />)
            ) : boardsError ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <InlineAlert>{String(boardsError)}</InlineAlert>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className={cn(
                    'group flex min-h-[140px] w-full flex-col justify-between rounded-xl border border-dashed border-border/70 bg-surface-1/40 p-4 text-left text-sm text-muted-foreground transition',
                    'hover:border-primary/60 hover:bg-surface-2/50 hover:text-foreground'
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80 group-hover:text-foreground">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-surface-2/70 text-base">
                      +
                    </span>
                    Create board
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Start a new workflow for a project, team, or domain.
                  </div>
                  <div className="mt-auto text-xs text-primary/80 group-hover:text-primary">Open creator</div>
                </button>

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
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Selected board</div>
            <h2 className="mt-1 text-base font-semibold tracking-tight">
              {selectedBoard ? selectedBoard.name : 'No board selected'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedBoard
                ? selectedBoard.description || 'Move cards to advance the work.'
                : 'Select a board above to view tasks.'}
            </p>
          </div>
          <div className="w-full sm:max-w-md">
            {selectedBoardId ? (
              <div className="flex flex-col gap-2">
                <NewTask onCreate={onCreateTask} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectionMode((prev) => !prev)}
                  >
                    {selectionMode ? 'Done selecting' : 'Select'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleSelectAll}
                    disabled={!filteredTasks.length}
                  >
                    {allVisibleSelected ? 'Clear selection' : 'Select all visible'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-border/70 bg-surface-1/50 px-3 py-2 text-xs text-muted-foreground">
                Select a board to create tasks.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks… (Ctrl+K or /)"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>
          </div>
          {selectionMode ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{selectedIds.length} selected</span>
              <select
                className="h-8 rounded-md border border-input/70 bg-surface-1/70 px-2 text-xs text-foreground"
                value=""
                onChange={(e) => {
                  const next = e.target.value as TaskStatus;
                  if (!next || selectedIds.length === 0) return;
                  bulkMoveM.mutate({ ids: selectedIds, status: next });
                  setSelectedIds([]);
                }}
              >
                <option value="">Move to…</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!selectedIds.length) return;
                  bulkMoveM.mutate({ ids: selectedIds, status: 'archived' });
                  setSelectedIds([]);
                }}
                disabled={selectedIds.length === 0}
              >
                Archive
              </Button>
            </div>
          ) : null}
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
        ) : filteredTasks.length === 0 ? (
          <EmptyState title="No tasks yet" subtitle="Create one with the input above." />
        ) : (
          <TaskBoard
            tasks={filteredTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            onMoveTask={onMoveTask}
            moveDisabled={moveDisabled}
            onReorder={onReorder}
            onQuickCreate={onQuickCreate}
            selectionMode={selectionMode}
            selectedIds={selectedSet}
            onToggleSelect={toggleSelection}
          />
        )}
      </div>
    </div>
  );
}
