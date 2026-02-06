import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Sidebar } from '../components/Sidebar/Sidebar';
import { AppShell } from '../components/Layout/AppShell';
import { MobileNav } from '../components/Layout/MobileNav';
import { useMobileNav } from '../state/mobile-nav';
import { MobileEdge } from '../components/Layout/MobileEdge';
import { Dashboard } from '../components/Dashboard/Dashboard';
import { AutomationsPage } from '../components/Automations/AutomationsPage';
import { KanbanPage } from '../components/Tasks/KanbanPage';
import { TaskDrawer } from '../components/Tasks/TaskDrawer';
import { DocsPage } from '../components/Docs/DocsPage';
import { MemoryPage } from '../components/Docs/MemoryPage';
import { AgentsPage } from '../components/Agents/AgentsPage';
import { SkillsPage } from '../components/Skills/SkillsPage';
import { ModelsPage } from '../components/Models/ModelsPage';

import type { Task } from '../api/types';
import { createTask, listBoards, listTasks, patchTask, reorderTasks } from '../api/queries';
import { startRealtime } from './realtime';

export function App() {
  const qc = useQueryClient();

  const [page, setPage] = useState<'dashboard' | 'kanban' | 'automations' | 'docs' | 'memory' | 'agents' | 'skills' | 'models'>('dashboard');
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const mobileNav = useMobileNav();

  useEffect(() => {
    document.body.style.overflow = mobileNav.open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNav.open]);

  const boardsQ = useQuery({ queryKey: ['boards'], queryFn: listBoards });
  useEffect(() => {
    if (selectedBoardId) return;
    const first = boardsQ.data?.[0];
    if (first) setSelectedBoardId(first.id);
  }, [boardsQ.data, selectedBoardId]);

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
    return startRealtime({ apiBase: base, qc });
  }, [qc]);

  const openAgentsPage = () => {
    setPage('agents');
    setSelectedTaskId(null);
  };

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar
            selectedPage={page}
            onSelectPage={(p) => setPage(p)}
            mobileOpen={mobileNav.open}
            onCloseMobile={() => mobileNav.setOpen(false)}
          />
        }
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
              setPage('kanban');
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
        ) : page === 'memory' ? (
          <div className="mx-auto w-full max-w-6xl">
            <MemoryPage />
          </div>
        ) : page === 'agents' ? (
          <div className="mx-auto w-full max-w-6xl">
            <AgentsPage />
          </div>
        ) : page === 'skills' ? (
          <div className="mx-auto w-full max-w-6xl">
            <SkillsPage />
          </div>
        ) : page === 'models' ? (
          <div className="mx-auto w-full max-w-6xl">
            <ModelsPage />
          </div>
        ) : page === 'kanban' ? (
          <div className="mx-auto w-full max-w-6xl">
            <KanbanPage
              boards={boardsQ.data ?? []}
              boardsLoading={boardsQ.isLoading}
              boardsError={boardsQ.isError ? boardsQ.error : null}
              selectedBoardId={selectedBoardId}
              onSelectBoard={(id) => setSelectedBoardId(id)}
              tasks={tasks}
              tasksLoading={tasksQ.isLoading}
              tasksError={tasksQ.isError ? tasksQ.error : null}
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
              onCreateTask={async (title) => {
                if (!selectedBoardId) return;
                await createM.mutateAsync({ boardId: selectedBoardId, title, status: 'ideas' });
              }}
              createTaskError={createM.isError ? createM.error : null}
              moveError={moveM.isError ? moveM.error : null}
              reorderError={reorderM.isError ? reorderM.error : null}
            />
          </div>
        ) : null}
      </AppShell>

      <TaskDrawer
        task={selectedTask}
        open={selectedTask != null}
        onOpenChange={(o) => !o && setSelectedTaskId(null)}
        onOpenAgents={openAgentsPage}
      />
    </>
  );
}
