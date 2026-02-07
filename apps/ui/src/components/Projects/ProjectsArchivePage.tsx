import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { listProjects, patchProject } from '../../api/queries';
import { PageHeader } from '../Layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';

export function ProjectsArchivePage({
  onOpenProject,
}: {
  onOpenProject: (projectId: string) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const archivedQ = useQuery({
    queryKey: ['projects', 'archived'],
    queryFn: () => listProjects({ archived: 'only' }),
  });

  const restoreM = useMutation({
    mutationFn: async (projectId: string) => patchProject(projectId, { isArchived: false }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['projects'] });
      await qc.invalidateQueries({ queryKey: ['projects-tree'] });
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('Archived Projects')} subtitle={t('Restore archived projects back to the workspace list.')} />

      {archivedQ.isError || restoreM.isError ? (
        <div className="mt-4">
          <InlineAlert>{String(archivedQ.error ?? restoreM.error)}</InlineAlert>
        </div>
      ) : null}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t('Archive')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {archivedQ.isLoading ? (
            <div className="text-sm text-muted-foreground">{t('Loading archived projects…')}</div>
          ) : (archivedQ.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">{t('Archive is empty.')}</div>
          ) : (
            (archivedQ.data ?? []).map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-surface-2/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{project.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {project.archived_at ? new Date(project.archived_at).toLocaleString() : '—'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onOpenProject(project.id)}
                  >
                    {t('Open')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => restoreM.mutate(project.id)}
                    disabled={restoreM.isPending}
                  >
                    {restoreM.isPending ? t('Restoring…') : t('Restore')}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
