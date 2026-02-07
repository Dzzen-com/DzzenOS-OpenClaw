import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { NavigationTree } from '../../api/types';
import {
  IconBot,
  IconFile,
  IconKanban,
  IconLayout,
  IconReport,
  IconSettings,
} from '../ui/Icons';
import { StatusDot } from '../ui/StatusDot';

export type MainNavKey = 'dashboard' | 'agents' | 'memory' | 'projects' | 'docs';

const RAIL_ITEMS: Array<{ key: MainNavKey; label: string; icon: JSX.Element }> = [
  { key: 'dashboard', label: 'Dashboard', icon: <IconLayout /> },
  { key: 'agents', label: 'Agents', icon: <IconBot /> },
  { key: 'memory', label: 'Memory', icon: <IconReport /> },
  { key: 'projects', label: 'Projects', icon: <IconKanban /> },
  { key: 'docs', label: 'Docs', icon: <IconFile /> },
];

export function Sidebar({
  selectedMain,
  onSelectMain,
  projectsTree,
  treeLoading,
  treeError,
  selectedProjectId,
  selectedSectionId,
  selectedTaskId,
  onOpenProject,
  onOpenSection,
  onOpenTask,
  mobileOpen = false,
  onCloseMobile,
}: {
  selectedMain: MainNavKey;
  onSelectMain: (p: MainNavKey) => void;
  projectsTree?: NavigationTree | null;
  treeLoading?: boolean;
  treeError?: unknown | null;
  selectedProjectId?: string | null;
  selectedSectionId?: string | null;
  selectedTaskId?: string | null;
  onOpenProject: (projectId: string) => void;
  onOpenSection: (projectId: string, sectionId: string) => void;
  onOpenTask: (projectId: string, taskId: string) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const { t } = useTranslation();
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});
  const version =
    (((import.meta as any).env?.VITE_APP_VERSION as string | undefined)?.trim() ||
      ((import.meta as any).env?.VITE_DZZENOS_VERSION as string | undefined)?.trim() ||
      ((import.meta as any).env?.VITE_PACKAGE_VERSION as string | undefined)?.trim() ||
      '0.0.0');

  const projectMap = useMemo(() => {
    const next: Record<string, boolean> = { ...openProjects };
    for (const project of projectsTree?.projects ?? []) {
      if (project.id === selectedProjectId && next[project.id] == null) next[project.id] = true;
    }
    return next;
  }, [openProjects, projectsTree?.projects, selectedProjectId]);

  return (
    <aside
      className={
        'fixed inset-y-0 left-0 z-50 flex h-dvh w-[336px] border-r border-border/60 bg-card/95 backdrop-blur transition ' +
        (mobileOpen ? 'translate-x-0' : '-translate-x-full') +
        ' sm:translate-x-0'
      }
    >
      <div className="flex w-14 shrink-0 flex-col items-center border-r border-border/60 py-3">
        <div className="mb-3 h-8 w-8 rounded-md bg-gradient-to-br from-sky-500 to-teal-500" />
        <div className="grid gap-1">
          {RAIL_ITEMS.map((item) => {
            const active = selectedMain === item.key;
            return (
              <button
                key={item.key}
                type="button"
                title={t(item.label)}
                onClick={() => {
                  onSelectMain(item.key);
                  onCloseMobile?.();
                }}
                className={
                  'flex h-8 w-8 items-center justify-center rounded-md border text-foreground transition ' +
                  (active
                    ? 'border-primary/60 bg-surface-2/80'
                    : 'border-transparent bg-transparent hover:border-border/70 hover:bg-surface-2/60')
                }
              >
                {item.icon}
              </button>
            );
          })}
        </div>
        <div className="mt-auto">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border/70 hover:bg-surface-2/60 hover:text-foreground"
            title={t('Settings')}
          >
            <IconSettings />
          </button>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border/60 px-3 py-3">
          <div className="text-sm font-semibold text-foreground">Dzzen</div>
          <div className="text-xs text-muted-foreground">{t('Minimal workspace')}</div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {selectedMain === 'projects' ? (
            <div className="grid gap-2">
              {treeLoading ? (
                <div className="rounded-md border border-border/70 bg-surface-1/60 px-3 py-2 text-xs text-muted-foreground">
                  {t('Loading projects…')}
                </div>
              ) : treeError ? (
                <div className="rounded-md border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {String(treeError)}
                </div>
              ) : (projectsTree?.projects ?? []).length === 0 ? (
                <div className="rounded-md border border-border/70 bg-surface-1/60 px-3 py-2 text-xs text-muted-foreground">
                  {t('No projects yet')}
                </div>
              ) : (
                (projectsTree?.projects ?? []).map((project) => {
                  const isOpen = projectMap[project.id] ?? false;
                  return (
                    <div key={project.id} className="rounded-md border border-border/70 bg-surface-1/50">
                      <div className="flex items-center gap-1 px-1.5 py-1.5">
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2/70"
                          onClick={() => setOpenProjects((prev) => ({ ...prev, [project.id]: !isOpen }))}
                        >
                          {isOpen ? '▾' : '▸'}
                        </button>
                        <button
                          type="button"
                          className={
                            'flex-1 rounded-md px-2 py-1 text-left text-xs transition ' +
                            (selectedProjectId === project.id ? 'bg-surface-2/80 text-foreground' : 'text-foreground hover:bg-surface-2/60')
                          }
                          onClick={() => {
                            onOpenProject(project.id);
                            onCloseMobile?.();
                          }}
                        >
                          <div className="font-medium">{project.name}</div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {project.counters.doing} doing · {project.counters.review} review
                          </div>
                        </button>
                      </div>
                      {isOpen ? (
                        <div className="grid gap-1 border-t border-border/60 px-2 py-2">
                          {project.sections.map((section) => (
                            <div key={section.id} className="rounded-md border border-border/60 bg-surface-2/30 px-1.5 py-1">
                              <button
                                type="button"
                                className={
                                  'w-full rounded-md px-2 py-1 text-left text-xs transition ' +
                                  (selectedSectionId === section.id ? 'bg-surface-2/80 text-foreground' : 'text-muted-foreground hover:bg-surface-2/60 hover:text-foreground')
                                }
                                onClick={() => {
                                  onOpenSection(project.id, section.id);
                                  onCloseMobile?.();
                                }}
                              >
                                {section.name} · {section.counters.doing}/{section.counters.review}
                              </button>
                              <div className="mt-1 grid gap-1 pl-2">
                                {section.tasks.map((task) => (
                                  <button
                                    key={task.id}
                                    type="button"
                                    className={
                                      'flex items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition ' +
                                      (selectedTaskId === task.id ? 'bg-surface-2/90 text-foreground' : 'text-muted-foreground hover:bg-surface-2/60')
                                    }
                                    onClick={() => {
                                      onOpenTask(project.id, task.id);
                                      onCloseMobile?.();
                                    }}
                                  >
                                    <StatusDot tone={task.status === 'review' ? 'warning' : 'info'} />
                                    <span className="truncate">{task.title}</span>
                                  </button>
                                ))}
                                {(section.counters.doing + section.counters.review) > section.tasks.length ? (
                                  <button
                                    type="button"
                                    className="rounded-md px-2 py-1 text-left text-[10px] text-muted-foreground hover:bg-surface-2/60 hover:text-foreground"
                                    onClick={() => {
                                      onOpenSection(project.id, section.id);
                                      onCloseMobile?.();
                                    }}
                                  >
                                    {t('Show more…')}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="rounded-md border border-border/70 bg-surface-1/60 px-3 py-2 text-xs text-muted-foreground">
              {t('Open')} {t(RAIL_ITEMS.find((item) => item.key === selectedMain)?.label ?? 'Dashboard')}
            </div>
          )}
        </div>

        <div className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
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
