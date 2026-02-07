import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { NavigationTree } from '../../api/types';
import { IconBot, IconFile, IconKanban, IconLayout, IconReport, IconSettings } from '../ui/Icons';
import { StatusDot } from '../ui/StatusDot';

export type MainNavKey = 'dashboard' | 'agents' | 'projects' | 'docs' | 'settings';

type SidebarItem = {
  key: MainNavKey;
  label: string;
  icon: JSX.Element;
};

const TOP_ITEMS: SidebarItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <IconLayout /> },
  { key: 'agents', label: 'Agents', icon: <IconBot /> },
];

function taskTone(pendingApproval: boolean): 'warning' | 'info' {
  return pendingApproval ? 'warning' : 'info';
}

export function Sidebar({
  selectedMain,
  onSelectMain,
  projectsTree,
  treeLoading,
  treeError,
  selectedProjectId,
  selectedTaskId,
  onOpenProject,
  onOpenTask,
  onOpenProjectMemory,
  onArchiveProject,
  onReorderProjects,
  onOpenArchivePage,
  mobileOpen = false,
  onCloseMobile,
}: {
  selectedMain: MainNavKey;
  onSelectMain: (p: MainNavKey) => void;
  projectsTree?: NavigationTree | null;
  treeLoading?: boolean;
  treeError?: unknown | null;
  selectedProjectId?: string | null;
  selectedTaskId?: string | null;
  onOpenProject: (projectId: string) => void;
  onOpenTask: (projectId: string, taskId: string) => void;
  onOpenProjectMemory: (projectId: string) => void;
  onArchiveProject: (projectId: string) => void;
  onReorderProjects: (orderedIds: string[]) => void;
  onOpenArchivePage: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const { t } = useTranslation();
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [dragProjectId, setDragProjectId] = useState<string | null>(null);

  const version =
    (((import.meta as any).env?.VITE_APP_VERSION as string | undefined)?.trim() ||
      ((import.meta as any).env?.VITE_DZZENOS_VERSION as string | undefined)?.trim() ||
      ((import.meta as any).env?.VITE_PACKAGE_VERSION as string | undefined)?.trim() ||
      '0.0.0');

  const projects = projectsTree?.projects ?? [];

  const projectMap = useMemo(() => {
    const next: Record<string, boolean> = { ...openProjects };
    for (const project of projects) {
      if (project.id === selectedProjectId && next[project.id] == null) next[project.id] = true;
    }
    return next;
  }, [openProjects, projects, selectedProjectId]);

  const handleDropOnProject = (targetProjectId: string) => {
    if (!dragProjectId || dragProjectId === targetProjectId) return;
    const ids = projects.map((project) => project.id);
    const from = ids.indexOf(dragProjectId);
    const to = ids.indexOf(targetProjectId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorderProjects(next);
    setDragProjectId(null);
  };

  return (
    <aside
      className={
        'fixed inset-y-0 left-0 z-50 flex h-dvh w-[288px] flex-col border-r border-border/60 bg-card/95 backdrop-blur transition ' +
        (mobileOpen ? 'translate-x-0' : '-translate-x-full') +
        ' sm:translate-x-0'
      }
    >
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-sky-500 to-teal-500" />
          <div>
            <div className="text-sm font-semibold text-foreground">Dzzen</div>
            <div className="text-[11px] text-muted-foreground">{t('Founder Workspace')}</div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        <nav className="grid gap-1">
          {TOP_ITEMS.map((item) => {
            const active = selectedMain === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  onSelectMain(item.key);
                  onCloseMobile?.();
                }}
                className={
                  'flex h-8 items-center gap-2 rounded-md border px-2 text-sm transition ' +
                  (active
                    ? 'border-primary/60 bg-surface-2/80 text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-surface-2/60 hover:text-foreground')
                }
              >
                {item.icon}
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-4 border-t border-border/60 pt-3">
          <div className="px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('Workspace')}</div>

          <div className="mt-2 rounded-md border border-border/70 bg-surface-1/40 p-1">
            <div className="flex items-center justify-between gap-2 px-2 py-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <IconKanban />
                <span>{t('Projects')}</span>
              </div>
            </div>

            <div className="mt-1 grid gap-1">
              {treeLoading ? (
                <div className="rounded-md px-2 py-2 text-xs text-muted-foreground">{t('Loading projects…')}</div>
              ) : treeError ? (
                <div className="rounded-md border border-danger/50 bg-danger/10 px-2 py-2 text-xs text-danger">{String(treeError)}</div>
              ) : projects.length === 0 ? (
                <div className="rounded-md px-2 py-2 text-xs text-muted-foreground">{t('No projects yet')}</div>
              ) : (
                projects.map((project) => {
                  const isOpen = projectMap[project.id] ?? false;
                  const inProgress = project.focus_lists?.in_progress ?? [];
                  const needsUser = project.focus_lists?.needs_user ?? [];
                  const needsUserTotal = project.focus_lists?.needs_user_total ?? (project.counters?.needs_user ?? 0);

                  return (
                    <div
                      key={project.id}
                      draggable
                      onDragStart={() => setDragProjectId(project.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropOnProject(project.id)}
                      className="rounded-md border border-border/60 bg-surface-2/30"
                    >
                      <div className="flex items-center gap-1 px-1 py-1">
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2/70"
                          onClick={() => setOpenProjects((prev) => ({ ...prev, [project.id]: !isOpen }))}
                        >
                          {isOpen ? '▾' : '▸'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onOpenProject(project.id);
                            onCloseMobile?.();
                          }}
                          className={
                            'min-w-0 flex-1 rounded-md px-2 py-1 text-left transition ' +
                            (selectedProjectId === project.id ? 'bg-surface-2/80' : 'hover:bg-surface-2/60')
                          }
                        >
                          <div className="truncate text-xs font-medium text-foreground">{project.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {project.counters?.doing ?? 0} doing · {needsUserTotal} needs user
                          </div>
                        </button>
                        <button
                          type="button"
                          title={t('Archive project')}
                          onClick={() => onArchiveProject(project.id)}
                          className="h-6 rounded-md px-1.5 text-[10px] text-muted-foreground hover:bg-surface-2/70 hover:text-foreground"
                        >
                          {t('Archive')}
                        </button>
                      </div>

                      {isOpen ? (
                        <div className="grid gap-1 border-t border-border/60 px-2 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              onOpenProjectMemory(project.id);
                              onCloseMobile?.();
                            }}
                            className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-surface-2/60 hover:text-foreground"
                          >
                            <IconReport />
                            <span>{t('Memory')}</span>
                          </button>

                          <div className="rounded-md border border-border/60 bg-surface-2/30 px-2 py-1.5">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('In Progress')}</div>
                            <div className="mt-1 grid gap-1">
                              {inProgress.length === 0 ? (
                                <div className="text-[11px] text-muted-foreground">{t('No tasks')}</div>
                              ) : (
                                inProgress.map((task) => (
                                  <button
                                    key={task.id}
                                    type="button"
                                    onClick={() => {
                                      onOpenTask(project.id, task.id);
                                      onCloseMobile?.();
                                    }}
                                    className={
                                      'flex items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition ' +
                                      (selectedTaskId === task.id ? 'bg-surface-2/90 text-foreground' : 'text-muted-foreground hover:bg-surface-2/60')
                                    }
                                  >
                                    <StatusDot tone="info" />
                                    <span className="truncate">{task.title}</span>
                                  </button>
                                ))
                              )}
                              {project.focus_lists?.in_progress_total > inProgress.length ? (
                                <button
                                  type="button"
                                  className="rounded-md px-2 py-1 text-left text-[10px] text-muted-foreground hover:bg-surface-2/60 hover:text-foreground"
                                  onClick={() => {
                                    onOpenProject(project.id);
                                    onCloseMobile?.();
                                  }}
                                >
                                  {t('Show more…')}
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div className="rounded-md border border-border/60 bg-surface-2/30 px-2 py-1.5">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Needs User')}</div>
                            <div className="mt-1 grid gap-1">
                              {needsUser.length === 0 ? (
                                <div className="text-[11px] text-muted-foreground">{t('No tasks')}</div>
                              ) : (
                                needsUser.map((task) => (
                                  <button
                                    key={task.id}
                                    type="button"
                                    onClick={() => {
                                      onOpenTask(project.id, task.id);
                                      onCloseMobile?.();
                                    }}
                                    className={
                                      'flex items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition ' +
                                      (selectedTaskId === task.id ? 'bg-surface-2/90 text-foreground' : 'text-muted-foreground hover:bg-surface-2/60')
                                    }
                                  >
                                    <StatusDot tone={taskTone(Boolean(task.pending_approval))} />
                                    <span className="truncate">{task.title}</span>
                                  </button>
                                ))
                              )}
                              {needsUserTotal > needsUser.length ? (
                                <button
                                  type="button"
                                  className="rounded-md px-2 py-1 text-left text-[10px] text-muted-foreground hover:bg-surface-2/60 hover:text-foreground"
                                  onClick={() => {
                                    onOpenProject(project.id);
                                    onCloseMobile?.();
                                  }}
                                >
                                  {t('Show more…')}
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid gap-1">
                            <div className="rounded-md px-2 py-1 text-xs text-muted-foreground opacity-50">CRM {t('(Soon)')}</div>
                            <div className="rounded-md px-2 py-1 text-xs text-muted-foreground opacity-50">Email {t('(Soon)')}</div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 px-2 py-2">
        <button
          type="button"
          onClick={() => {
            onSelectMain('docs');
            onCloseMobile?.();
          }}
          className={
            'flex h-8 w-full items-center gap-2 rounded-md border px-2 text-sm transition ' +
            (selectedMain === 'docs'
              ? 'border-primary/60 bg-surface-2/80 text-foreground'
              : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-surface-2/60 hover:text-foreground')
          }
        >
          <IconFile />
          <span>{t('Docs')}</span>
        </button>

        <div className="mt-1">
          <button
            type="button"
            onClick={() => {
              setSettingsExpanded((prev) => !prev);
              onSelectMain('settings');
            }}
            className={
              'flex h-8 w-full items-center justify-between gap-2 rounded-md border px-2 text-sm transition ' +
              (selectedMain === 'settings'
                ? 'border-primary/60 bg-surface-2/80 text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-surface-2/60 hover:text-foreground')
            }
          >
            <span className="flex items-center gap-2">
              <IconSettings />
              {t('Settings')}
            </span>
            <span className="text-xs">{settingsExpanded ? '▾' : '▸'}</span>
          </button>

          {settingsExpanded ? (
            <div className="mt-1 grid gap-1 pl-6">
              <button
                type="button"
                onClick={() => {
                  onOpenArchivePage();
                  onCloseMobile?.();
                }}
                className="h-7 rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-surface-2/60 hover:text-foreground"
              >
                {t('Archive')}
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-2 border-t border-border/60 px-1 pt-2 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>DzzenOS</span>
            <span>{version}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <a href="https://dzzen.com" className="hover:text-foreground">dzzen.com</a>
            <span>·</span>
            <a href="https://github.com/Dzzen-com/DzzenOS-OpenClaw" className="hover:text-foreground">GitHub</a>
          </div>
        </div>
      </div>
    </aside>
  );
}
