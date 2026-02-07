import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Sidebar, type MainNavKey } from '../components/Sidebar/Sidebar';
import { AppShell } from '../components/Layout/AppShell';
import { MobileNav } from '../components/Layout/MobileNav';
import { useMobileNav } from '../state/mobile-nav';
import { MobileEdge } from '../components/Layout/MobileEdge';
import { Dashboard } from '../components/Dashboard/Dashboard';
import { KanbanPage } from '../components/Tasks/KanbanPage';
import { DocsPage } from '../components/Docs/DocsPage';
import { MemoryPage } from '../components/Docs/MemoryPage';
import { AgentsHubPage } from '../components/Agents/AgentsHubPage';
import { ProjectHomePage } from '../components/Projects/ProjectHomePage';
import { TaskPage } from '../components/Tasks/TaskPage';

import type { SectionViewMode, Task } from '../api/types';
import {
  createProject,
  createSection,
  createTask,
  getProjectsTree,
  getTaskDetails,
  listProjects,
  listSections,
  listTasks,
  patchTask,
  reorderTasks,
} from '../api/queries';
import { startRealtime } from './realtime';

type AgentsTab = 'overview' | 'models' | 'profiles' | 'subagents' | 'skills' | 'orchestration';

type AppRoute =
  | { main: 'dashboard'; projectId: string | null }
  | { main: 'agents'; tab: AgentsTab }
  | { main: 'memory' }
  | { main: 'docs' }
  | {
      main: 'projects';
      projectId: string | null;
      sectionId: string | null;
      taskId: string | null;
      mode: SectionViewMode | null;
      legacyAlias: boolean;
    };

const AGENTS_TABS: AgentsTab[] = ['overview', 'models', 'profiles', 'subagents', 'skills', 'orchestration'];

function viewModeStorageKey(sectionId: string) {
  return `dzzenos.section.view.${sectionId}`;
}

function readStoredViewMode(sectionId: string | null): SectionViewMode | null {
  if (!sectionId) return null;
  const raw = localStorage.getItem(viewModeStorageKey(sectionId));
  if (raw === 'kanban' || raw === 'threads') return raw;
  return null;
}

function parseRouteFromLocation(loc: Location | URL): AppRoute {
  const path = loc.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(loc.search);

  if (path === '/' || path === '/dashboard') {
    return { main: 'dashboard', projectId: params.get('projectId') };
  }

  if (path.startsWith('/agents')) {
    const seg = path.split('/').filter(Boolean)[1];
    const tab = (AGENTS_TABS.includes(seg as AgentsTab) ? (seg as AgentsTab) : 'overview');
    return { main: 'agents', tab };
  }

  if (path.startsWith('/memory')) {
    return { main: 'memory' };
  }

  if (path.startsWith('/docs')) {
    return { main: 'docs' };
  }

  if (path.startsWith('/projects') || path.startsWith('/kanban')) {
    const legacyAlias = path.startsWith('/kanban');
    const segments = path.split('/').filter(Boolean);

    if (legacyAlias) {
      return {
        main: 'projects',
        projectId: params.get('projectId'),
        sectionId: params.get('sectionId') ?? params.get('boardId'),
        taskId: params.get('taskId'),
        mode: params.get('mode') === 'threads' ? 'threads' : params.get('mode') === 'kanban' ? 'kanban' : null,
        legacyAlias: true,
      };
    }

    const projectId = segments[1] ?? null;
    const modeRaw = params.get('mode');
    const mode = modeRaw === 'kanban' || modeRaw === 'threads' ? modeRaw : null;

    if (segments[2] === 'sections') {
      return {
        main: 'projects',
        projectId,
        sectionId: segments[3] ?? null,
        taskId: null,
        mode,
        legacyAlias: false,
      };
    }

    if (segments[2] === 'tasks') {
      return {
        main: 'projects',
        projectId,
        sectionId: null,
        taskId: segments[3] ?? null,
        mode,
        legacyAlias: false,
      };
    }

    return {
      main: 'projects',
      projectId,
      sectionId: null,
      taskId: null,
      mode,
      legacyAlias: false,
    };
  }

  return { main: 'dashboard', projectId: null };
}

function buildRoutePath(route: AppRoute): string {
  if (route.main === 'dashboard') {
    const qs = new URLSearchParams();
    if (route.projectId) qs.set('projectId', route.projectId);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return `/dashboard${suffix}`;
  }
  if (route.main === 'agents') return `/agents/${route.tab}`;
  if (route.main === 'memory') return '/memory';
  if (route.main === 'docs') return '/docs';

  if (!route.projectId) return '/projects';
  if (route.taskId) return `/projects/${encodeURIComponent(route.projectId)}/tasks/${encodeURIComponent(route.taskId)}`;
  if (!route.sectionId) return `/projects/${encodeURIComponent(route.projectId)}`;

  const qs = new URLSearchParams();
  if (route.mode) qs.set('mode', route.mode);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return `/projects/${encodeURIComponent(route.projectId)}/sections/${encodeURIComponent(route.sectionId)}${suffix}`;
}

export function App() {
  const qc = useQueryClient();
  const mobileNav = useMobileNav();
  const [route, setRoute] = useState<AppRoute>(() => parseRouteFromLocation(window.location));

  useEffect(() => {
    document.body.style.overflow = mobileNav.open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNav.open]);

  useEffect(() => {
    const onPopState = () => setRoute(parseRouteFromLocation(window.location));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (next: AppRoute, opts?: { replace?: boolean }) => {
    const path = buildRoutePath(next);
    if (opts?.replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    setRoute(next);
  };

  const projectsQ = useQuery({ queryKey: ['projects'], queryFn: listProjects });

  const fallbackProjectId = projectsQ.data?.[0]?.id ?? null;
  const selectedProjectId = useMemo(() => {
    if (route.main === 'projects' || route.main === 'dashboard') {
      return route.projectId ?? fallbackProjectId;
    }
    return fallbackProjectId;
  }, [fallbackProjectId, route]);

  const sectionsQ = useQuery({
    queryKey: ['sections', selectedProjectId],
    queryFn: () => {
      if (!selectedProjectId) return Promise.resolve([] as any[]);
      return listSections(selectedProjectId);
    },
    enabled: !!selectedProjectId,
  });

  const selectedSectionId = useMemo(() => {
    if (route.main !== 'projects') return null;
    if (!route.sectionId) return null;
    return route.sectionId;
  }, [route]);

  const [sectionViewMode, setSectionViewMode] = useState<SectionViewMode>('kanban');
  useEffect(() => {
    const section = sectionsQ.data?.find((s) => s.id === selectedSectionId) ?? null;
    const stored = readStoredViewMode(selectedSectionId);
    const next = route.main === 'projects' && route.mode ? route.mode : stored ?? (section?.view_mode ?? 'kanban');
    setSectionViewMode(next);
  }, [route, selectedSectionId, sectionsQ.data]);

  const taskRouteDetailsQ = useQuery({
    queryKey: ['task-details', route.main === 'projects' ? route.taskId : null, 'route'],
    queryFn: () => getTaskDetails(route.main === 'projects' ? route.taskId ?? '' : ''),
    enabled: route.main === 'projects' && !!route.taskId,
  });

  const sectionForTask = taskRouteDetailsQ.data?.section_id ?? null;

  const tasksQ = useQuery({
    queryKey: ['tasks', selectedProjectId, selectedSectionId, sectionViewMode],
    queryFn: () => {
      if (!selectedProjectId || !selectedSectionId) return Promise.resolve([] as Task[]);
      return listTasks({
        projectId: selectedProjectId,
        sectionId: selectedSectionId,
        viewMode: sectionViewMode,
      });
    },
    enabled: !!selectedProjectId && !!selectedSectionId && route.main === 'projects' && !route.taskId,
  });

  const projectTasksQ = useQuery({
    queryKey: ['tasks', selectedProjectId, 'project-home'],
    queryFn: () => {
      if (!selectedProjectId) return Promise.resolve([] as Task[]);
      return listTasks({ projectId: selectedProjectId });
    },
    enabled: !!selectedProjectId && route.main === 'projects' && !route.sectionId && !route.taskId,
  });

  const treeQ = useQuery({
    queryKey: ['projects-tree', selectedProjectId],
    queryFn: () => getProjectsTree({ projectId: selectedProjectId ?? undefined, limitPerSection: 5 }),
  });

  useEffect(() => {
    if (route.main !== 'projects') return;

    if (route.legacyAlias) {
      navigate(
        {
          ...route,
          legacyAlias: false,
        },
        { replace: true }
      );
      return;
    }

    if (!route.projectId && fallbackProjectId) {
      navigate(
        {
          main: 'projects',
          projectId: fallbackProjectId,
          sectionId: null,
          taskId: null,
          mode: null,
          legacyAlias: false,
        },
        { replace: true }
      );
    }
  }, [fallbackProjectId, route]);

  useEffect(() => {
    const apiBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
    const base = typeof apiBase === 'string' && apiBase.trim() ? apiBase.trim() : 'http://127.0.0.1:8787';
    return startRealtime({ apiBase: base, qc });
  }, [qc]);

  const openProject = (projectId: string) => {
    navigate({ main: 'projects', projectId, sectionId: null, taskId: null, mode: null, legacyAlias: false });
  };

  const openSection = (projectId: string, sectionId: string, mode?: SectionViewMode | null) => {
    const nextMode = mode ?? readStoredViewMode(sectionId) ?? 'kanban';
    navigate({
      main: 'projects',
      projectId,
      sectionId,
      taskId: null,
      mode: nextMode,
      legacyAlias: false,
    });
  };

  const openTask = (projectId: string, taskId: string) => {
    navigate({
      main: 'projects',
      projectId,
      sectionId: null,
      taskId,
      mode: null,
      legacyAlias: false,
    });
  };

  const createProjectM = useMutation({
    mutationFn: async (name: string) => createProject({ name }),
    onSuccess: async (project) => {
      await qc.invalidateQueries({ queryKey: ['projects'] });
      await qc.invalidateQueries({ queryKey: ['projects-tree'] });
      openProject(project.id);
    },
  });

  const createSectionM = useMutation({
    mutationFn: async (name: string) => {
      if (!selectedProjectId) throw new Error('No project selected');
      return createSection(selectedProjectId, { name });
    },
    onSuccess: async (section) => {
      await qc.invalidateQueries({ queryKey: ['sections', section.project_id] });
      await qc.invalidateQueries({ queryKey: ['projects-tree'] });
      openSection(section.project_id, section.id, section.view_mode ?? 'kanban');
    },
  });

  const createTaskM = useMutation({
    mutationFn: async (vars: { projectId: string; sectionId?: string | null; title: string; status?: Task['status'] }) =>
      createTask({ projectId: vars.projectId, sectionId: vars.sectionId ?? undefined, title: vars.title, status: vars.status }),
    onSuccess: async (task) => {
      await qc.invalidateQueries({ queryKey: ['tasks'] });
      await qc.invalidateQueries({ queryKey: ['projects-tree'] });
      openTask(task.project_id, task.id);
    },
  });

  const moveM = useMutation({
    mutationFn: async (vars: { id: string; status: Task['status'] }) => patchTask(vars.id, { status: vars.status }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['tasks'] });
      await qc.invalidateQueries({ queryKey: ['projects-tree'] });
    },
    onError: async () => {
      await qc.invalidateQueries({ queryKey: ['tasks'] });
      await qc.invalidateQueries({ queryKey: ['projects-tree'] });
    },
  });

  const reorderM = useMutation({
    mutationFn: async (vars: { sectionId: string; orderedIds: string[] }) => reorderTasks({ boardId: vars.sectionId, orderedIds: vars.orderedIds }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['tasks'] });
      await qc.invalidateQueries({ queryKey: ['projects-tree'] });
    },
  });

  const selectedProject = useMemo(
    () => (projectsQ.data ?? []).find((project) => project.id === selectedProjectId) ?? null,
    [projectsQ.data, selectedProjectId]
  );

  const sidebarMain: MainNavKey =
    route.main === 'projects' ? 'projects' : route.main === 'agents' ? 'agents' : route.main === 'memory' ? 'memory' : route.main === 'docs' ? 'docs' : 'dashboard';

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar
            selectedMain={sidebarMain}
            onSelectMain={(main) => {
              if (main === 'dashboard') {
                navigate({ main: 'dashboard', projectId: selectedProjectId });
              } else if (main === 'agents') {
                navigate({ main: 'agents', tab: 'overview' });
              } else if (main === 'memory') {
                navigate({ main: 'memory' });
              } else if (main === 'docs') {
                navigate({ main: 'docs' });
              } else {
                navigate({
                  main: 'projects',
                  projectId: selectedProjectId,
                  sectionId: null,
                  taskId: null,
                  mode: null,
                  legacyAlias: false,
                });
              }
              mobileNav.setOpen(false);
            }}
            projectsTree={treeQ.data ?? null}
            treeLoading={treeQ.isLoading}
            treeError={treeQ.isError ? treeQ.error : null}
            selectedProjectId={selectedProjectId}
            selectedSectionId={selectedSectionId ?? sectionForTask}
            selectedTaskId={route.main === 'projects' ? route.taskId : null}
            onOpenProject={(projectId) => openProject(projectId)}
            onOpenSection={(projectId, sectionId) => openSection(projectId, sectionId)}
            onOpenTask={(projectId, taskId) => openTask(projectId, taskId)}
            mobileOpen={mobileNav.open}
            onCloseMobile={() => mobileNav.setOpen(false)}
          />
        }
        mobileNav={
          <MobileNav
            page={sidebarMain}
            onSelectPage={(page) => {
              if (page === 'dashboard') {
                navigate({ main: 'dashboard', projectId: selectedProjectId });
              } else if (page === 'agents') {
                navigate({ main: 'agents', tab: 'overview' });
              } else if (page === 'memory') {
                navigate({ main: 'memory' });
              } else if (page === 'docs') {
                navigate({ main: 'docs' });
              } else {
                navigate({
                  main: 'projects',
                  projectId: selectedProjectId,
                  sectionId: null,
                  taskId: null,
                  mode: null,
                  legacyAlias: false,
                });
              }
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

        {route.main === 'dashboard' ? (
          <Dashboard
            projectId={selectedProjectId}
            onSelectProject={(projectId) => navigate({ main: 'dashboard', projectId })}
            onSelectTask={({ projectId, taskId }) => openTask(projectId, taskId)}
            onQuickCapture={async (title) => {
              if (!selectedProjectId) return;
              const inbox = (sectionsQ.data ?? []).find((section) => section.section_kind === 'inbox') ?? sectionsQ.data?.[0] ?? null;
              await createTaskM.mutateAsync({
                projectId: selectedProjectId,
                sectionId: inbox?.id,
                title,
                status: 'ideas',
              });
            }}
          />
        ) : route.main === 'agents' ? (
          <AgentsHubPage tab={route.tab} onSelectTab={(tab) => navigate({ main: 'agents', tab })} />
        ) : route.main === 'memory' ? (
          <div className="mx-auto w-full max-w-6xl">
            <MemoryPage />
          </div>
        ) : route.main === 'docs' ? (
          <div className="mx-auto w-full max-w-6xl">
            <DocsPage />
          </div>
        ) : route.taskId ? (
          <TaskPage
            taskId={route.taskId}
            onBack={() => {
              const projectId = selectedProjectId;
              const sectionId = sectionForTask;
              if (projectId && sectionId) {
                openSection(projectId, sectionId);
                return;
              }
              if (projectId) {
                openProject(projectId);
                return;
              }
              navigate({ main: 'dashboard', projectId: null });
            }}
            onOpenAgents={() => navigate({ main: 'agents', tab: 'overview' })}
          />
        ) : route.sectionId ? (
          <div className="mx-auto w-full max-w-6xl">
            <KanbanPage
              projects={projectsQ.data ?? []}
              projectsLoading={projectsQ.isLoading}
              projectsError={projectsQ.isError ? projectsQ.error : null}
              sections={sectionsQ.data ?? []}
              sectionsLoading={sectionsQ.isLoading}
              sectionsError={sectionsQ.isError ? sectionsQ.error : null}
              selectedProjectId={selectedProjectId}
              onSelectProject={(projectId) => openProject(projectId)}
              selectedSectionId={selectedSectionId}
              onSelectSection={(sectionId) => {
                if (!selectedProjectId) return;
                openSection(selectedProjectId, sectionId, sectionViewMode);
              }}
              viewMode={sectionViewMode}
              onChangeViewMode={(mode) => {
                setSectionViewMode(mode);
                if (selectedSectionId) localStorage.setItem(viewModeStorageKey(selectedSectionId), mode);
                if (selectedProjectId && selectedSectionId) {
                  openSection(selectedProjectId, selectedSectionId, mode);
                }
              }}
              onCreateProject={async (name) => {
                await createProjectM.mutateAsync(name);
              }}
              onCreateSection={async (name) => {
                await createSectionM.mutateAsync(name);
              }}
              tasks={tasksQ.data ?? []}
              tasksLoading={tasksQ.isLoading}
              tasksError={tasksQ.isError ? tasksQ.error : null}
              selectedTaskId={null}
              onSelectTask={(taskId) => {
                if (!selectedProjectId) return;
                openTask(selectedProjectId, taskId);
              }}
              onMoveTask={(id, status) => moveM.mutate({ id, status })}
              moveDisabled={moveM.isPending || reorderM.isPending}
              onReorder={(_status, orderedIds) => {
                if (!selectedSectionId) return;
                reorderM.mutate({ sectionId: selectedSectionId, orderedIds });
              }}
              onQuickCreate={async (status, title) => {
                if (!selectedProjectId) return;
                await createTaskM.mutateAsync({
                  projectId: selectedProjectId,
                  sectionId: selectedSectionId,
                  title,
                  status,
                });
              }}
              onCreateTask={async (title) => {
                if (!selectedProjectId) return;
                await createTaskM.mutateAsync({
                  projectId: selectedProjectId,
                  sectionId: selectedSectionId,
                  title,
                  status: 'ideas',
                });
              }}
              createTaskError={createTaskM.isError ? createTaskM.error : null}
              moveError={moveM.isError ? moveM.error : null}
              reorderError={reorderM.isError ? reorderM.error : null}
            />
          </div>
        ) : (
          <ProjectHomePage
            project={selectedProject}
            sections={sectionsQ.data ?? []}
            tasks={projectTasksQ.data ?? []}
            onOpenSection={(sectionId) => {
              if (!selectedProjectId) return;
              openSection(selectedProjectId, sectionId);
            }}
            onOpenTask={(taskId) => {
              if (!selectedProjectId) return;
              openTask(selectedProjectId, taskId);
            }}
          />
        )}
      </AppShell>
    </>
  );
}
