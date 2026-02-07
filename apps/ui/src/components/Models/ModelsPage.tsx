import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { OpenClawProvider, OpenClawProviderInput } from '../../api/types';
import {
  applyModelsConfig,
  createModelProvider,
  deleteModelProvider,
  getModelProviderOAuthStatus,
  listModelsOverview,
  scanModels,
  startModelProviderOAuth,
  updateModelProvider,
} from '../../api/queries';
import { PageHeader } from '../Layout/PageHeader';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { InlineAlert } from '../ui/InlineAlert';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';

type ProviderDraft = {
  id: string;
  kind: string;
  enabled: boolean;
  auth_mode: 'api_key' | 'oauth' | 'none';
  api_base_url: string;
  api_key: string;
  options_json: string;
  oauth_json: string;
};

const EMPTY_DRAFT: ProviderDraft = {
  id: '',
  kind: '',
  enabled: true,
  auth_mode: 'api_key',
  api_base_url: '',
  api_key: '',
  options_json: '',
  oauth_json: '',
};

function parseObjectJson(raw: string, label: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function providerAuthBadgeVariant(state: OpenClawProvider['auth_state']): 'success' | 'warning' | 'danger' | 'outline' {
  if (state === 'connected') return 'success';
  if (state === 'pending') return 'warning';
  if (state === 'error') return 'danger';
  return 'outline';
}

function modelAvailabilityBadgeVariant(state: 'ready' | 'degraded' | 'unavailable' | 'unknown'): 'success' | 'warning' | 'danger' | 'outline' {
  if (state === 'ready') return 'success';
  if (state === 'degraded') return 'warning';
  if (state === 'unavailable') return 'danger';
  return 'outline';
}

function isFinalOAuthStatus(status: string): boolean {
  return status === 'connected' || status === 'error' || status === 'timeout' || status === 'not_configured';
}

function ProviderDialog({
  open,
  onOpenChange,
  mode,
  initial,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial: ProviderDraft;
  busy: boolean;
  onSubmit: (payload: OpenClawProviderInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ProviderDraft>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(initial);
    setError(null);
  }, [open, initial]);

  async function submit() {
    try {
      setError(null);
      const id = draft.id.trim();
      const kind = draft.kind.trim();
      if (!id) throw new Error(t('Provider id is required'));
      if (!kind) throw new Error(t('Provider kind is required'));

      const payload: OpenClawProviderInput = {
        id,
        kind,
        enabled: draft.enabled,
        auth_mode: draft.auth_mode,
      };

      const apiBaseUrl = draft.api_base_url.trim();
      if (apiBaseUrl) payload.api_base_url = apiBaseUrl;

      const apiKey = draft.api_key.trim();
      if (apiKey) payload.api_key = apiKey;

      const optionsObj = parseObjectJson(draft.options_json, 'Options JSON');
      if (optionsObj) payload.options = optionsObj;

      const oauthObj = parseObjectJson(draft.oauth_json, 'OAuth JSON');
      if (oauthObj) payload.oauth = oauthObj;

      await onSubmit(payload);
      onOpenChange(false);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(680px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border/70 bg-surface-1 p-4 shadow-panel">
          <Dialog.Title className="text-base font-semibold text-foreground">
            {mode === 'create' ? t('Connect provider') : t('Edit')}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            {t('Configure provider connection details for OpenClaw models.')}
          </Dialog.Description>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('Provider id')}</label>
              <Input
                value={draft.id}
                onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))}
                placeholder="openai-main"
                disabled={mode === 'edit'}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('Provider kind')}</label>
              <Input
                value={draft.kind}
                onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
                placeholder="openai"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('Auth mode')}</label>
              <select
                value={draft.auth_mode}
                onChange={(e) => setDraft((d) => ({ ...d, auth_mode: e.target.value as ProviderDraft['auth_mode'] }))}
                className="h-9 w-full rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm text-foreground"
              >
                <option value="api_key">{t('API key')}</option>
                <option value="oauth">OAuth</option>
                <option value="none">{t('None')}</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-border/70 bg-surface-1"
                />
                {t('Enabled')}
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">{t('API base URL (optional)')}</label>
              <Input
                value={draft.api_base_url}
                onChange={(e) => setDraft((d) => ({ ...d, api_base_url: e.target.value }))}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">{t('API key (optional)')}</label>
              <Input
                value={draft.api_key}
                onChange={(e) => setDraft((d) => ({ ...d, api_key: e.target.value }))}
                placeholder={mode === 'edit' ? t('Leave empty to keep current key') : 'sk-...'}
                type="password"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">{t('OAuth JSON (optional)')}</label>
              <textarea
                value={draft.oauth_json}
                onChange={(e) => setDraft((d) => ({ ...d, oauth_json: e.target.value }))}
                rows={3}
                placeholder='{"scopes":["models.read"]}'
                className="w-full resize-y rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">{t('Options JSON (optional)')}</label>
              <textarea
                value={draft.options_json}
                onChange={(e) => setDraft((d) => ({ ...d, options_json: e.target.value }))}
                rows={4}
                placeholder='{"organization":"org_xxx"}'
                className="w-full resize-y rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
              />
            </div>
          </div>

          {error ? <div className="mt-3"><InlineAlert>{error}</InlineAlert></div> : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              {t('Cancel')}
            </Button>
            <Button onClick={submit} disabled={busy}>
              {mode === 'create' ? t('Connect') : t('Save')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ModelsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingProvider, setEditingProvider] = useState<OpenClawProvider | null>(null);
  const [modelQuery, setModelQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'ready' | 'degraded' | 'unavailable' | 'unknown'>('all');
  const [oauthState, setOauthState] = useState<{ providerId: string; attemptId: string | null } | null>(null);
  const [oauthInfo, setOauthInfo] = useState<string | null>(null);

  const overviewQ = useQuery({ queryKey: ['models-overview'], queryFn: listModelsOverview });

  const createM = useMutation({
    mutationFn: createModelProvider,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['models-overview'] });
    },
  });

  const updateM = useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<OpenClawProviderInput> }) => updateModelProvider(vars.id, vars.patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['models-overview'] });
    },
  });

  const deleteM = useMutation({
    mutationFn: deleteModelProvider,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['models-overview'] });
    },
  });

  const scanM = useMutation({
    mutationFn: scanModels,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['models-overview'] });
    },
  });

  const applyM = useMutation({
    mutationFn: applyModelsConfig,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['models-overview'] });
    },
  });

  const oauthStartM = useMutation({
    mutationFn: startModelProviderOAuth,
  });

  const providers = overviewQ.data?.providers ?? [];
  const models = overviewQ.data?.models ?? [];

  useEffect(() => {
    if (!oauthState) return;
    let cancelled = false;

    const poll = async () => {
      for (let i = 0; i < 40; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        if (cancelled) return;
        try {
          const status = await getModelProviderOAuthStatus(oauthState.providerId, { attemptId: oauthState.attemptId });
          if (cancelled) return;
          if (isFinalOAuthStatus(status.status)) {
            setOauthState(null);
          setOauthInfo(status.message ?? `${t('OAuth status')}: ${status.status}`);
            await qc.invalidateQueries({ queryKey: ['models-overview'] });
            return;
          }
        } catch (err: any) {
          if (cancelled) return;
          setOauthState(null);
          setOauthInfo(`${t('OAuth polling failed')}: ${String(err?.message ?? err)}`);
          return;
        }
      }
      if (!cancelled) {
        setOauthState(null);
        setOauthInfo(t('OAuth polling timed out. Try reconnecting.'));
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [oauthState?.providerId, oauthState?.attemptId, qc]);

  const availableProviderIds = useMemo(() => {
    const ids = new Set<string>(providers.map((p) => p.id));
    for (const model of models) ids.add(model.provider_id);
    return [...ids].sort((a, b) => a.localeCompare(b));
  }, [providers, models]);

  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    return models.filter((m) => {
      if (providerFilter !== 'all' && m.provider_id !== providerFilter) return false;
      if (availabilityFilter !== 'all' && m.availability !== availabilityFilter) return false;
      if (!q) return true;
      const hay = `${m.id} ${m.display_name} ${m.provider_id} ${m.availability}`.toLowerCase();
      return hay.includes(q);
    });
  }, [models, modelQuery, providerFilter, availabilityFilter]);

  const dialogDraft = useMemo<ProviderDraft>(() => {
    if (!editingProvider) return EMPTY_DRAFT;
    return {
      id: editingProvider.id,
      kind: editingProvider.kind,
      enabled: editingProvider.enabled,
      auth_mode: editingProvider.auth_mode,
      api_base_url: '',
      api_key: '',
      options_json: '',
      oauth_json: '',
    };
  }, [editingProvider]);

  const busy = createM.isPending || updateM.isPending || deleteM.isPending || scanM.isPending || applyM.isPending || oauthStartM.isPending;
  const topError =
    overviewQ.error ??
    createM.error ??
    updateM.error ??
    deleteM.error ??
    scanM.error ??
    applyM.error ??
    oauthStartM.error;

  async function handleProviderSubmit(payload: OpenClawProviderInput) {
    if (dialogMode === 'create') {
      await createM.mutateAsync(payload);
      return;
    }
    await updateM.mutateAsync({ id: payload.id, patch: payload });
  }

  async function handleOAuthStart(providerId: string) {
    try {
      setOauthInfo(null);
      const started = await oauthStartM.mutateAsync(providerId);
      if (started.auth_url) {
        window.open(started.auth_url, '_blank', 'noopener,noreferrer');
      }
      setOauthState({ providerId, attemptId: started.attempt_id ?? null });
      setOauthInfo(t('OAuth flow started. Waiting for confirmation...'));
    } catch (err: any) {
      setOauthInfo(`${t('OAuth start failed')}: ${String(err?.message ?? err)}`);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title={t('Models')}
        subtitle={t('Native OpenClaw model provider management without console.')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => scanM.mutate()}
              disabled={busy}
            >
              {t('Scan models')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => applyM.mutate()}
              disabled={busy}
            >
              {t('Apply config')}
            </Button>
            <Button
              onClick={() => {
                setDialogMode('create');
                setEditingProvider(null);
                setDialogOpen(true);
              }}
              disabled={busy}
            >
              {t('Connect provider')}
            </Button>
          </div>
        }
      />

      {topError ? (
        <InlineAlert>{String((topError as any)?.message ?? topError)}</InlineAlert>
      ) : null}

      {oauthInfo ? <InlineAlert>{oauthInfo}</InlineAlert> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Connected Providers</CardTitle>
            <CardDescription>{t('Detected from OpenClaw config/runtime.')}</CardDescription>
          </CardHeader>
          <CardContent>
            {overviewQ.isLoading ? (
              <div className="grid gap-2">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </div>
            ) : providers.length === 0 ? (
              <EmptyState title={t('No providers connected')} subtitle={t('Connect your first provider to enable models.')} />
            ) : (
              <div className="grid gap-3">
                {providers.map((provider) => (
                  <div key={provider.id} className="rounded-lg border border-border/70 bg-surface-2/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{provider.id}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline">{provider.kind}</Badge>
                          <Badge variant={providerAuthBadgeVariant(provider.auth_state)}>{provider.auth_state}</Badge>
                          <Badge variant={provider.enabled ? 'success' : 'outline'}>
                            {provider.enabled ? t('enabled') : t('disabled')}
                          </Badge>
                          <Badge variant="outline">{provider.auth_mode}</Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDialogMode('edit');
                            setEditingProvider(provider);
                            setDialogOpen(true);
                          }}
                          disabled={busy}
                        >
                          {t('Edit')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOAuthStart(provider.id)}
                          disabled={busy || provider.auth_mode !== 'oauth'}
                        >
                          {t('Reconnect OAuth')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            if (!window.confirm(`Disconnect provider "${provider.id}"?`)) return;
                            await deleteM.mutateAsync(provider.id);
                          }}
                          disabled={busy}
                        >
                          {t('Disconnect')}
                        </Button>
                      </div>
                    </div>
                    {provider.last_error ? (
                      <div className="mt-2 text-xs text-danger">{t('Last error: {{error}}', { error: provider.last_error })}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Available Models')}</CardTitle>
            <CardDescription>
              {t('Runtime model catalog. Last sync: {{time}}', {
                time: overviewQ.data?.updated_at ? new Date(overviewQ.data.updated_at).toLocaleString() : '—',
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <Input
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder={t('Search models...')}
              />
              <select
                className="h-9 w-full rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm text-foreground"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
              >
                <option value="all">{t('All providers')}</option>
                {availableProviderIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              <select
                className="h-9 w-full rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm text-foreground"
                value={availabilityFilter}
                onChange={(e) => setAvailabilityFilter(e.target.value as any)}
              >
                <option value="all">{t('All statuses')}</option>
                <option value="ready">ready</option>
                <option value="degraded">degraded</option>
                <option value="unavailable">unavailable</option>
                <option value="unknown">unknown</option>
              </select>
            </div>

            {overviewQ.isLoading ? (
              <div className="grid gap-2">
                <Skeleton className="h-11 rounded-lg" />
                <Skeleton className="h-11 rounded-lg" />
                <Skeleton className="h-11 rounded-lg" />
              </div>
            ) : filteredModels.length === 0 ? (
              <EmptyState title={t('No models found')} subtitle={t('Run a scan or adjust filters.')} />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Model')}</TableHead>
                      <TableHead>{t('Provider')}</TableHead>
                      <TableHead>{t('Status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredModels.map((m) => (
                      <TableRow key={`${m.provider_id}:${m.id}`}>
                        <TableCell>
                          <div className="font-mono text-xs text-foreground">{m.id}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{m.display_name}</div>
                        </TableCell>
                        <TableCell>{m.provider_id}</TableCell>
                        <TableCell>
                          <Badge variant={modelAvailabilityBadgeVariant(m.availability)}>{m.availability}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        initial={dialogDraft}
        busy={busy}
        onSubmit={handleProviderSubmit}
      />
    </div>
  );
}
