import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Sidebar } from '../components/Sidebar/Sidebar';
import { TopBar } from '../components/TopBar/TopBar';
import { AppShell } from '../components/Layout/AppShell';
import { Footer } from '../components/Footer/Footer';
import { MobileNav } from '../components/Layout/MobileNav';
import { useMobileNav } from '../state/mobile-nav';
import { MobileEdge } from '../components/Layout/MobileEdge';
import { Dashboard } from '../components/Dashboard/Dashboard';
import { AutomationsPage } from '../components/Automations/AutomationsPage';
import { TaskBoard } from '../components/Tasks/TaskBoard';
import { TaskBoardSkeleton } from '../components/Tasks/TaskBoardSkeleton';
import { TaskDrawer } from '../components/Tasks/TaskDrawer';
import { NewTask } from '../components/Tasks/NewTask';
import { DocsPage } from '../components/Docs/DocsPage';
import { AgentsPage } from '../components/Agents/AgentsPage';
import { EmptyState } from '../components/ui/EmptyState';
import { InlineAlert } from '../components/ui/InlineAlert';

import type { Task } from '../api/types';
import { createTask, listBoards, listTasks, patchTask, reorderTasks } from '../api/queries';
import { startRealtime } from './realtime';

export function App() {
  const qc = useQueryClient();

  const [page, setPage] = useState<'dashboard' | 'tasks' | 'automations' | 'docs' | 'agents'>('dashboard');
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [rtStatus, setRtStatus] = useState<{ connected: boolean; error?: string } | null>(null);
  const mobileNav = useMobileNav();

  useEffect(() => {
    document.body.style.overflow = mobileNav.open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNav.open]);

  const boardsQ = useQuery({ queryKey: ['boards'], queryFn: listBoards });

  const tasksQ = useQuery({
    queryKey: ['tasks', selectedBoardId],
    queryFn: () => {
      if (!selectedBoardId) return Promise.resolve([] as Task[]);
      return listTasks(selectedBoardId);
    },
    enabled: !!selectedBoardId,
  });

  const createM = useMutation({
    mutationFn: async (vars: { boardId: string; title: string; status?: Task['status'] }) =>
      createTask({ boardId: vars.boardId, title: vars.title, status: vars.status }),
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ['tasks', t.board_id] });
      setSelectedTaskId(t.id);
    },
  });

  const moveM = useMutation({
    mutationFn: async (vars: { id: string; status: Task['status'] }) => patchTask(vars.id, { status: vars.status }),
    onSuccess: async (t, vars) => {
      await qc.invalidateQueries({ queryKey: ['tasks', t.board_id] });
    },
    onError: async () => {
      if (selectedBoardId) {
        await qc.invalidateQueries({ queryKey: ['tasks', selectedBoardId] });
      }
    },
  });

  const reorderM = useMutation({
    mutationFn: async (vars: { boardId: string; orderedIds: string[] }) => reorderTasks(vars),
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({ queryKey: ['tasks', vars.boardId] });
    },
  });

  const tasks = tasksQ.data ?? [];
  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);

  // If board changes, clear the selected task.
  useEffect(() => {
    setSelectedTaskId(null);
  }, [selectedBoardId]);

  // Real-time updates (SSE)
  useEffect(() => {
    const apiBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
    const base = typeof apiBase === 'string' && apiBase.trim() ? apiBase.trim() : 'http://127.0.0.1:8787';
    return startRealtime({ apiBase: base, qc, onStatus: (s) => setRtStatus(s) });
  }, [qc]);

  const apiBase = ((import.meta as any).env?.VITE_API_BASE as string | undefined) ?? 'http://127.0.0.1:8787';
  const apiStatus: 'connected' | 'checking' | 'disconnected' = boardsQ.isError
    ? 'disconnected'
    : boardsQ.isSuccess
      ? 'connected'
      : 'checking';
  const realtimeStatus: 'connected' | 'checking' | 'disconnected' = rtStatus
    ? rtStatus.connected
      ? 'connected'
      : rtStatus.error
        ? 'disconnected'
        : 'checking'
    : 'checking';

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar
            selectedPage={page}
            onSelectPage={(p) => setPage(p)}
            selectedBoardId={selectedBoardId}
            onSelectBoard={(id) => setSelectedBoardId(id)}
            mobileOpen={mobileNav.open}
            onCloseMobile={() => mobileNav.setOpen(false)}
          />
        }
        topbar={
          <TopBar
            title={
              page === 'dashboard'
                ? 'Dashboard'
                : page === 'automations'
                  ? 'Automations'
                  : page === 'docs'
                    ? 'Docs'
                    : page === 'agents'
                      ? 'Agent Library'
                      : 'Tasks'
            }
            subtitle={
              page === 'dashboard'
                ? 'Progress overview'
                : page === 'automations'
                  ? 'Build & run flows'
                  : page === 'docs'
                    ? 'Workspace and board memory'
                    : page === 'agents'
                      ? 'Manage OpenClaw agent profiles'
                      : 'All tasks'
            }
          />
        }
        footer={<Footer apiBase={apiBase} apiStatus={apiStatus} realtimeStatus={realtimeStatus} onSelectDocs={() => setPage('docs')} />}
        mobileNav={
          <MobileNav
            page={page}
            onSelectPage={(p) => {
              setPage(p);
              mobileNav.setOpen(false);
            }}
          />
        }
      >
        <MobileEdge />
        {mobileNav.open ? (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm sm:hidden"
            onClick={() => mobileNav.setOpen(false)}
            aria-hidden="true"
          />
        ) : null}
        {page === 'dashboard' ? (
          <Dashboard
            onSelectTask={({ boardId, taskId }) => {
              setPage('tasks');
              setSelectedBoardId(boardId);
              setSelectedTaskId(null);
              queueMicrotask(() => setSelectedTaskId(taskId));
            }}
          />
        ) : page === 'automations' ? (
          <div className="mx-auto w-full max-w-6xl">
            <AutomationsPage />
          </div>
        ) : page === 'docs' ? (
          <div className="mx-auto w-full max-w-6xl">
            <DocsPage />
          </div>
        ) : page === 'agents' ? (
          <div className="mx-auto w-full max-w-6xl">
            <AgentsPage />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-6xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
                <p className="mt-1 text-sm text-muted-foreground">Local API-backed list.</p>
              </div>

              <div className="w-full sm:max-w-md">
                <NewTask
                  onCreate={async (title) => {
                    if (!selectedBoardId) return;
                    await createM.mutateAsync({ boardId: selectedBoardId, title, status: 'ideas' });
                  }}
                />
              </div>
            </div>

            {createM.isError ? (
              <div className="mt-3">
                <InlineAlert>{String(createM.error)}</InlineAlert>
              </div>
            ) : null}
            {moveM.isError || reorderM.isError ? (
              <div className="mt-3">
                <InlineAlert>{String(moveM.error ?? reorderM.error)}</InlineAlert>
              </div>
            ) : null}

            <div className="mt-4">
                  {!selectedBoardId ? (
                    <EmptyState title="Select a board" subtitle="Boards are loaded from GET /boards." />
                  ) : tasksQ.isLoading ? (
                    <TaskBoardSkeleton />
                  ) : tasksQ.isError ? (
                    <InlineAlert>{String(tasksQ.error)}</InlineAlert>
                  ) : tasks.length === 0 ? (
                <EmptyState title="No tasks yet" subtitle="Create one with the input above." />
              ) : (
                <TaskBoard
                  tasks={tasks}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={(id) => setSelectedTaskId(id)}
                  onMoveTask={(id, status) => moveM.mutate({ id, status })}
                  moveDisabled={moveM.isPending || reorderM.isPending}
                  onReorder={(status, orderedIds) => {
                    if (!selectedBoardId) return;
                    reorderM.mutate({ boardId: selectedBoardId, orderedIds });
                  }}
                  onQuickCreate={async (status, title) => {
                    if (!selectedBoardId) return;
                    await createM.mutateAsync({ boardId: selectedBoardId, title, status });
                  }}
                />
              )}
            </div>
          </div>
        )}
      </AppShell>

      <TaskDrawer task={selectedTask} open={selectedTask != null} onOpenChange={(o) => !o && setSelectedTaskId(null)} />
    </>
  );
}
