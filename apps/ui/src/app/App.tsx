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

import type { SectionViewMode, Task } from '../api/types';
import {
  createProject,
  createSection,
  createTask,
  listProjects,
  listSections,
  listTasks,
  patchTask,
  reorderTasks,
} from '../api/queries';
import { startRealtime } from './realtime';

function viewModeStorageKey(sectionId: string) {
  return `dzzenos.section.view.${sectionId}`;
}

function readStoredViewMode(sectionId: string | null): SectionViewMode | null {
  if (!sectionId) return null;
  const raw = localStorage.getItem(viewModeStorageKey(sectionId));
  if (raw === 'kanban' || raw === 'threads') return raw;
  return null;
}

export function App() {
  const qc = useQueryClient();

  const [page, setPage] = useState<'dashboard' | 'kanban' | 'automations' | 'docs' | 'memory' | 'agents' | 'skills' | 'models'>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [sectionViewMode, setSectionViewMode] = useState<SectionViewMode>('kanban');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const mobileNav = useMobileNav();

  useEffect(() => {
    document.body.style.overflow = mobileNav.open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNav.open]);

  const projectsQ = useQuery({ queryKey: ['projects'], queryFn: listProjects });
  useEffect(() => {
    if (selectedProjectId) return;
    const first = projectsQ.data?.[0];
    if (first) setSelectedProjectId(first.id);
  }, [projectsQ.data, selectedProjectId]);

  const sectionsQ = useQuery({
    queryKey: ['sections', selectedProjectId],
    queryFn: () => {
      if (!selectedProjectId) return Promise.resolve([] as any[]);
      return listSections(selectedProjectId);
    },
    enabled: !!selectedProjectId,
  });

  useEffect(() => {
    if (!selectedProjectId) {
      setSelectedSectionId(null);
      return;
    }
    if (selectedSectionId && sectionsQ.data?.some((s) => s.id === selectedSectionId)) return;
    const first = sectionsQ.data?.[0] ?? null;
    setSelectedSectionId(first?.id ?? null);
  }, [selectedProjectId, selectedSectionId, sectionsQ.data]);

  useEffect(() => {
    const section = sectionsQ.data?.find((s) => s.id === selectedSectionId) ?? null;
    const stored = readStoredViewMode(selectedSectionId);
    const next = stored ?? (section?.view_mode ?? 'kanban');
    setSectionViewMode(next);
  }, [selectedSectionId, sectionsQ.data]);

  const tasksQ = useQuery({
    queryKey: ['tasks', selectedProjectId, selectedSectionId, sectionViewMode],
    queryFn: () => {
      if (!selectedProjectId) return Promise.resolve([] as Task[]);
      return listTasks({
        projectId: selectedProjectId,
        sectionId: selectedSectionId ?? undefined,
        viewMode: sectionViewMode,
      });
    },
    enabled: !!selectedProjectId,
  });

  const createProjectM = useMutation({
    mutationFn: async (name: string) => createProject({ name }),
    onSuccess: async (p) => {
      await qc.invalidateQueries({ queryKey: ['projects'] });
      await qc.invalidateQueries({ queryKey: ['sections', p.id] });
      setSelectedProjectId(p.id);
      setPage('kanban');
    },
  });

  const createSectionM = useMutation({
    mutationFn: async (name: string) => {
      if (!selectedProjectId) throw new Error('No project selected');
      return createSection(selectedProjectId, { name });
    },
    onSuccess: async (section) => {
      await qc.invalidateQueries({ queryKey: ['sections', section.project_id] });
      setSelectedSectionId(section.id);
      setSectionViewMode(section.view_mode ?? 'kanban');
    },
  });

  const createM = useMutation({
    mutationFn: async (vars: { projectId: string; sectionId?: string | null; title: string; status?: Task['status'] }) =>
      createTask({ projectId: vars.projectId, sectionId: vars.sectionId ?? undefined, title: vars.title, status: vars.status }),
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ['tasks'] });
      setSelectedTaskId(t.id);
    },
  });

  const moveM = useMutation({
    mutationFn: async (vars: { id: string; status: Task['status'] }) => patchTask(vars.id, { status: vars.status }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: async () => {
      await qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const reorderM = useMutation({
    mutationFn: async (vars: { sectionId: string; orderedIds: string[] }) => reorderTasks({ boardId: vars.sectionId, orderedIds: vars.orderedIds }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const tasks = tasksQ.data ?? [];
  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);

  useEffect(() => {
    setSelectedTaskId(null);
  }, [selectedSectionId]);

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
            projectId={selectedProjectId}
            onSelectProject={(id) => setSelectedProjectId(id)}
            onSelectTask={({ projectId, sectionId, taskId }) => {
              setPage('kanban');
              setSelectedProjectId(projectId);
              setSelectedSectionId(sectionId);
              setSelectedTaskId(null);
              queueMicrotask(() => setSelectedTaskId(taskId));
            }}
            onQuickCapture={async (title) => {
              if (!selectedProjectId) return;
              await createM.mutateAsync({ projectId: selectedProjectId, sectionId: selectedSectionId, title, status: 'ideas' });
              setPage('kanban');
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
              projects={projectsQ.data ?? []}
              projectsLoading={projectsQ.isLoading}
              projectsError={projectsQ.isError ? projectsQ.error : null}
              sections={sectionsQ.data ?? []}
              sectionsLoading={sectionsQ.isLoading}
              sectionsError={sectionsQ.isError ? sectionsQ.error : null}
              selectedProjectId={selectedProjectId}
              onSelectProject={(id) => setSelectedProjectId(id)}
              selectedSectionId={selectedSectionId}
              onSelectSection={(id) => setSelectedSectionId(id)}
              viewMode={sectionViewMode}
              onChangeViewMode={(mode) => {
                setSectionViewMode(mode);
                if (selectedSectionId) localStorage.setItem(viewModeStorageKey(selectedSectionId), mode);
              }}
              onCreateProject={async (name) => {
                await createProjectM.mutateAsync(name);
              }}
              onCreateSection={async (name) => {
                await createSectionM.mutateAsync(name);
              }}
              tasks={tasks}
              tasksLoading={tasksQ.isLoading}
              tasksError={tasksQ.isError ? tasksQ.error : null}
              selectedTaskId={selectedTaskId}
              onSelectTask={(id) => setSelectedTaskId(id)}
              onMoveTask={(id, status) => moveM.mutate({ id, status })}
              moveDisabled={moveM.isPending || reorderM.isPending}
              onReorder={(status, orderedIds) => {
                if (!selectedSectionId) return;
                reorderM.mutate({ sectionId: selectedSectionId, orderedIds });
              }}
              onQuickCreate={async (status, title) => {
                if (!selectedProjectId) return;
                await createM.mutateAsync({
                  projectId: selectedProjectId,
                  sectionId: selectedSectionId,
                  title,
                  status,
                });
              }}
              onCreateTask={async (title) => {
                if (!selectedProjectId) return;
                await createM.mutateAsync({
                  projectId: selectedProjectId,
                  sectionId: selectedSectionId,
                  title,
                  status: 'ideas',
                });
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
