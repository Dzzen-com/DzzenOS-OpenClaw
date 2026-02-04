import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Sidebar } from '../components/Sidebar/Sidebar';
import { TopBar } from '../components/TopBar/TopBar';
import { Dashboard } from '../components/Dashboard/Dashboard';
import { TaskTable } from '../components/Tasks/TaskTable';
import { TaskDrawer } from '../components/Tasks/TaskDrawer';
import { NewTask } from '../components/Tasks/NewTask';
import { EmptyState } from '../components/ui/EmptyState';
import { InlineAlert } from '../components/ui/InlineAlert';
import { Spinner } from '../components/ui/Spinner';

import type { Task } from '../api/types';
import { createTask, listTasks } from '../api/queries';

export function App() {
  const qc = useQueryClient();

  const [page, setPage] = useState<'dashboard' | 'tasks'>('dashboard');
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const tasksQ = useQuery({
    queryKey: ['tasks', selectedBoardId],
    queryFn: () => {
      if (!selectedBoardId) return Promise.resolve([] as Task[]);
      return listTasks(selectedBoardId);
    },
    enabled: !!selectedBoardId,
  });

  const createM = useMutation({
    mutationFn: async (vars: { boardId: string; title: string }) => createTask({ boardId: vars.boardId, title: vars.title }),
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ['tasks', t.board_id] });
      setSelectedTaskId(t.id);
    },
  });

  const tasks = tasksQ.data ?? [];
  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);

  // If board changes, clear the selected task.
  useEffect(() => {
    setSelectedTaskId(null);
  }, [selectedBoardId]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="flex min-h-dvh">
        <Sidebar
          selectedPage={page}
          onSelectPage={(p) => setPage(p)}
          selectedBoardId={selectedBoardId}
          onSelectBoard={(id) => setSelectedBoardId(id)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            title={page === 'dashboard' ? 'Dashboard' : 'Tasks'}
            subtitle={page === 'dashboard' ? 'Progress overview' : 'All tasks'}
          />

          <main className="min-w-0 flex-1 p-4 sm:p-6">
            {page === 'dashboard' ? (
              <Dashboard
                onSelectTask={({ boardId, taskId }) => {
                  setPage('tasks');
                  setSelectedBoardId(boardId);
                  setSelectedTaskId(null);
                  queueMicrotask(() => setSelectedTaskId(taskId));
                }}
              />
            ) : (
              <div className="mx-auto w-full max-w-6xl">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Local API-backed list.</p>
                  </div>

                  <div className="w-full sm:max-w-md">
                    <NewTask
                      onCreate={async (title) => {
                        if (!selectedBoardId) return;
                        await createM.mutateAsync({ boardId: selectedBoardId, title });
                      }}
                    />
                  </div>
                </div>

                {createM.isError ? (
                  <div className="mt-3">
                    <InlineAlert>{String(createM.error)}</InlineAlert>
                  </div>
                ) : null}

                <div className="mt-4">
                  {!selectedBoardId ? (
                    <EmptyState title="Select a board" subtitle="Boards are loaded from GET /boards." />
                  ) : tasksQ.isLoading ? (
                    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-panel">
                      <Spinner label="Loading tasks…" />
                    </div>
                  ) : tasksQ.isError ? (
                    <InlineAlert>{String(tasksQ.error)}</InlineAlert>
                  ) : tasks.length === 0 ? (
                    <EmptyState title="No tasks yet" subtitle="Create one with the input above." />
                  ) : (
                    <div className="rounded-xl border border-border/70 bg-card shadow-panel">
                      <TaskTable tasks={tasks} selectedTaskId={selectedTaskId} onSelectTask={(id) => setSelectedTaskId(id)} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      <TaskDrawer task={selectedTask} open={selectedTask != null} onOpenChange={(o) => !o && setSelectedTaskId(null)} />
    </div>
  );
}
