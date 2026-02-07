import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { Project, Section, Task, TaskStatus } from '../../api/types';
import { PageHeader } from '../Layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { statusLabel } from '../Tasks/status';

const ORDER: TaskStatus[] = ['ideas', 'todo', 'doing', 'review', 'release', 'done', 'archived'];

export function ProjectHomePage({
  project,
  sections,
  tasks,
  onOpenSection,
  onOpenTask,
}: {
  project: Project | null;
  sections: Section[];
  tasks: Task[];
  onOpenSection: (sectionId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const { t } = useTranslation();

  const counters = useMemo(() => {
    const out: Record<TaskStatus, number> = {
      ideas: 0,
      todo: 0,
      doing: 0,
      review: 0,
      release: 0,
      done: 0,
      archived: 0,
    };
    for (const task of tasks) out[task.status] += 1;
    return out;
  }, [tasks]);

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status === 'doing' || task.status === 'review').slice(0, 10),
    [tasks]
  );

  if (!project) {
    return <EmptyState title={t('Select a project')} subtitle={t('Choose a project in the left navigation tree.')} />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={project.name} subtitle={project.description || t('Project overview and active workload.')} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ORDER.map((status) => (
          <Card key={status}>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{statusLabel(status, t)}</div>
              <div className="mt-1 text-2xl font-semibold">{counters[status]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[340px,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('Sections')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {sections.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t('No sections yet.')}</div>
            ) : (
              sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className="rounded-md border border-border/70 bg-surface-2/40 px-3 py-2 text-left text-sm hover:bg-surface-2/70"
                  onClick={() => onOpenSection(section.id)}
                >
                  <div className="font-medium text-foreground">{section.name}</div>
                  <div className="text-xs text-muted-foreground">{section.section_kind === 'inbox' ? 'Inbox' : section.view_mode}</div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('Active tasks')}</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => onOpenSection(sections[0]?.id ?? '')} disabled={!sections.length}>
              {t('Open sections')}
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {activeTasks.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t('No active tasks right now.')}</div>
            ) : (
              activeTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="rounded-md border border-border/70 bg-surface-2/40 px-3 py-2 text-left hover:bg-surface-2/70"
                  onClick={() => onOpenTask(task.id)}
                >
                  <div className="text-sm font-medium text-foreground">{task.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {statusLabel(task.status, t)} · {new Date(task.updated_at).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
