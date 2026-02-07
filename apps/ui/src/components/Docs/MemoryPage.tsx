import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import {
  getMemoryDoc,
  getMemoryIndexStatus,
  getMemoryModels,
  listMemoryScopes,
  rebuildMemoryIndex,
  updateMemoryDoc,
  updateMemoryModels,
} from '../../api/queries';
import { PageHeader } from '../Layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { InlineAlert } from '../ui/InlineAlert';
import { Button } from '../ui/Button';

type ScopeKey = 'overview' | 'project' | 'section' | 'agent' | 'task';

const SCOPE_OPTIONS: ScopeKey[] = ['overview', 'project', 'section', 'agent', 'task'];

function scopeLabel(scope: ScopeKey, t: (s: string) => string) {
  if (scope === 'overview') return t('Overview');
  if (scope === 'project') return t('Project Memory');
  if (scope === 'section') return t('Section Memory');
  if (scope === 'agent') return t('Agent Memory');
  return t('Task Memory');
}

export function MemoryPage({
  forcedScope,
  forcedScopeId,
}: {
  forcedScope?: ScopeKey;
  forcedScopeId?: string | null;
} = {}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [scope, setScope] = useState<ScopeKey>(forcedScope ?? 'overview');
  const [scopeId, setScopeId] = useState(forcedScopeId ?? '');
  const [draft, setDraft] = useState('');
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [embeddingModelId, setEmbeddingModelId] = useState('');

  const scopesQ = useQuery({ queryKey: ['memory-scopes'], queryFn: listMemoryScopes });
  const docQ = useQuery({
    queryKey: ['memory-doc', scope, scopeId],
    queryFn: () => getMemoryDoc({ scope, id: scope === 'overview' ? undefined : scopeId }),
    enabled: scope === 'overview' || !!scopeId,
  });
  const indexQ = useQuery({ queryKey: ['memory-index-status'], queryFn: getMemoryIndexStatus });
  const modelsQ = useQuery({ queryKey: ['memory-models'], queryFn: getMemoryModels });

  const saveDocM = useMutation({
    mutationFn: async () =>
      updateMemoryDoc({
        scope,
        id: scope === 'overview' ? undefined : scopeId,
        content: draft,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['memory-doc', scope, scopeId] });
      await qc.invalidateQueries({ queryKey: ['docs'] });
    },
  });
  const rebuildM = useMutation({
    mutationFn: async () => rebuildMemoryIndex(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['memory-index-status'] });
    },
  });
  const saveModelsM = useMutation({
    mutationFn: async () =>
      updateMemoryModels({
        provider_id: providerId || null,
        model_id: modelId || null,
        embedding_model_id: embeddingModelId || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['memory-models'] });
    },
  });

  useEffect(() => {
    setDraft(docQ.data?.content ?? '');
  }, [docQ.data?.content]);

  useEffect(() => {
    setProviderId(modelsQ.data?.provider_id ?? '');
    setModelId(modelsQ.data?.model_id ?? '');
    setEmbeddingModelId(modelsQ.data?.embedding_model_id ?? '');
  }, [modelsQ.data?.provider_id, modelsQ.data?.model_id, modelsQ.data?.embedding_model_id]);

  useEffect(() => {
    if (!forcedScope) return;
    setScope(forcedScope);
  }, [forcedScope]);

  useEffect(() => {
    if (forcedScopeId == null) return;
    setScopeId(forcedScopeId);
  }, [forcedScopeId]);

  const scopeItems = useMemo(() => {
    const scopes = scopesQ.data;
    if (!scopes) return [];
    if (scope === 'project') return scopes.projects.map((p) => ({ id: p.id, label: p.name }));
    if (scope === 'section') return scopes.sections.map((s) => ({ id: s.id, label: s.name }));
    if (scope === 'agent') return scopes.agents.map((a) => ({ id: a.id, label: a.display_name }));
    if (scope === 'task') return scopes.tasks.map((task) => ({ id: task.id, label: task.title }));
    return [];
  }, [scopesQ.data, scope]);

  useEffect(() => {
    if (scope === 'overview') {
      setScopeId('');
      return;
    }
    if (scopeId && scopeItems.some((item) => item.id === scopeId)) return;
    setScopeId(scopeItems[0]?.id ?? '');
  }, [scope, scopeId, scopeItems]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('Memory')} subtitle={t('Project, section, agent and task memory hub with indexing controls.')} />

      {scopesQ.isError || docQ.isError || indexQ.isError || modelsQ.isError ? (
        <div className="mt-4">
          <InlineAlert>{String(scopesQ.error ?? docQ.error ?? indexQ.error ?? modelsQ.error)}</InlineAlert>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[320px,1fr]">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('Scope')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {forcedScope ? (
                <div className="rounded-md border border-border/70 bg-surface-1/50 px-3 py-2 text-sm text-foreground">
                  {scopeLabel(forcedScope, t)}
                </div>
              ) : (
                <select
                  className="h-9 rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as ScopeKey)}
                >
                  {SCOPE_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {scopeLabel(item, t)}
                    </option>
                  ))}
                </select>
              )}
              {scope !== 'overview' ? (
                <select
                  className="h-9 rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  disabled={!!forcedScopeId}
                >
                  {scopeItems.length ? (
                    scopeItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))
                  ) : (
                    <option value="">{t('No items')}</option>
                  )}
                </select>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('Indexing')}</CardTitle>
              <Button size="sm" onClick={() => rebuildM.mutate()} disabled={rebuildM.isPending}>
                {rebuildM.isPending ? t('Running…') : t('Reindex')}
              </Button>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <div>{t('Status')}: {indexQ.data?.status ?? 'idle'}</div>
              <div>{t('Last job')}: {indexQ.data?.last_job?.id ?? '—'}</div>
              <div>{t('Finished')}: {indexQ.data?.last_job?.finished_at ?? '—'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('Memory Models')}</CardTitle>
              <Button size="sm" onClick={() => saveModelsM.mutate()} disabled={saveModelsM.isPending}>
                {saveModelsM.isPending ? t('Saving…') : t('Save')}
              </Button>
            </CardHeader>
            <CardContent className="grid gap-2">
              <input
                className="h-9 rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm"
                placeholder={t('Provider id')}
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
              />
              <input
                className="h-9 rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm"
                placeholder={t('Model id')}
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
              />
              <input
                className="h-9 rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm"
                placeholder={t('Embedding model id')}
                value={embeddingModelId}
                onChange={(e) => setEmbeddingModelId(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{scopeLabel(scope, t)}</CardTitle>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => saveDocM.mutate()}
              disabled={saveDocM.isPending || (scope !== 'overview' && !scopeId)}
            >
              {saveDocM.isPending ? t('Saving…') : t('Save')}
            </Button>
          </CardHeader>
          <CardContent>
            <textarea
              className="min-h-[520px] w-full rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('Memory document content…')}
              disabled={scope !== 'overview' && !scopeId}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
