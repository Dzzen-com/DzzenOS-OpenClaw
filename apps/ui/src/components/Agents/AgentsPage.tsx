import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { Agent, MarketplaceAgent } from '../../api/types';
import { installMarketplaceAgent, listAgents, listMarketplaceAgents, patchAgent } from '../../api/queries';
import { PageHeader } from '../Layout/PageHeader';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { InlineAlert } from '../ui/InlineAlert';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { AgentDrawer } from './AgentDrawer';

function queryTokens(q: string): string[] {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesTokens(haystack: string, tokens: string[]) {
  if (!tokens.length) return true;
  const hay = haystack.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

function matchesQuery(
  agent: {
    display_name: string;
    description?: string | null;
    category?: string;
    tags?: string[];
    openclaw_agent_id?: string;
    skills?: string[];
  },
  q: string,
) {
  const tokens = queryTokens(q);
  if (!tokens.length) return true;

  const hay = [
    agent.display_name ?? '',
    agent.description ?? '',
    agent.category ?? '',
    ...(agent.tags ?? []),
    agent.openclaw_agent_id ?? '',
    ...(agent.skills ?? []),
  ].join(' ');

  return matchesTokens(hay, tokens);
}

function clampCategories(values: string[]) {
  return [...new Set(values.map((v) => (v || 'general').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function isTypingElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
}

function countPromptOverrides(agent: Agent) {
  const po = agent.prompt_overrides ?? {};
  const keys: (keyof typeof po)[] = ['system', 'plan', 'execute', 'chat', 'report'];
  let count = 0;
  for (const k of keys) {
    const v = po[k];
    if (typeof v === 'string' && v.trim()) count++;
  }
  return count;
}

export function AgentsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const searchRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | string>('all');
  const [showDisabled, setShowDisabled] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerAgent, setDrawerAgent] = useState<Agent | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '/') {
        if (isTypingElement(document.activeElement)) return;
        e.preventDefault();
        searchRef.current?.focus();
      }

      if (e.key === 'Escape') {
        if (search.trim()) {
          e.preventDefault();
          setSearch('');
          return;
        }
        if (category !== 'all') {
          e.preventDefault();
          setCategory('all');
          return;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [search, category]);

  const agentsQ = useQuery({ queryKey: ['agents'], queryFn: () => listAgents() });
  const marketplaceQ = useQuery({ queryKey: ['marketplace-agents'], queryFn: () => listMarketplaceAgents() });

  const toggleEnabledM = useMutation({
    mutationFn: async (vars: { id: string; enabled: boolean }) => patchAgent(vars.id, { enabled: vars.enabled }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agents'] });
      await qc.invalidateQueries({ queryKey: ['marketplace-agents'] });
    },
  });

  const installM = useMutation({
    mutationFn: async (presetKey: string) => installMarketplaceAgent(presetKey),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agents'] });
      await qc.invalidateQueries({ queryKey: ['marketplace-agents'] });
    },
  });

  const installedAgents = agentsQ.data ?? [];
  const availablePresets = (marketplaceQ.data ?? [])
    .filter((p) => !p.installed)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const categories = useMemo(() => {
    const installedCats = installedAgents.map((a) => a.category ?? 'general');
    const presetCats = (marketplaceQ.data ?? []).map((p) => p.category ?? 'general');
    return clampCategories([...installedCats, ...presetCats]);
  }, [installedAgents, marketplaceQ.data]);

  const installedFiltered = useMemo(() => {
    return installedAgents
      .filter((a) => (category === 'all' ? true : (a.category ?? 'general') === category))
      .filter((a) => matchesQuery(a, search));
  }, [installedAgents, category, search]);

  const installedActive = useMemo(() => installedFiltered.filter((a) => a.enabled), [installedFiltered]);
  const installedDisabled = useMemo(() => installedFiltered.filter((a) => !a.enabled), [installedFiltered]);

  const availableFiltered = useMemo(() => {
    return availablePresets
      .filter((p) => (category === 'all' ? true : (p.category ?? 'general') === category))
      .filter((p) => matchesQuery(p, search));
  }, [availablePresets, category, search]);

  const showClear = search.trim().length > 0 || category !== 'all';

  const headerActions = (
    <div className="w-full sm:w-auto">
      <div className="rounded-xl border border-border/70 bg-gradient-to-b from-surface-2/70 to-surface-1/70 p-2 shadow-panel backdrop-blur">
        <div className="flex w-full flex-col gap-2 lg:w-[720px] lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">{t('Search agents')}</label>
            <div className="relative">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              >
                <circle cx="9" cy="9" r="6" />
                <path d="M13.5 13.5L17 17" strokeLinecap="round" />
              </svg>
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Name, description, tags, OpenClaw id, skills...')}
                className="bg-background/35 pl-9 pr-12"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border/80 bg-surface-2/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                /
              </span>
            </div>
          </div>
          <div className="w-full lg:w-[180px]">
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">{t('Category')}</label>
            <select
              className="h-9 w-full rounded-md border border-input/70 bg-background/35 px-3 text-sm text-foreground"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">{t('All')}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {showClear ? (
            <Button
              variant="ghost"
              className="lg:self-end"
              onClick={() => {
                setSearch('');
                setCategory('all');
              }}
            >
              {t('Clear')}
            </Button>
          ) : null}
          <Button
            className="lg:self-end"
            onClick={() => {
              setDrawerAgent(null);
              setDrawerOpen(true);
            }}
          >
            {t('New agent')}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={t('Agents')}
        subtitle={t('Agent profiles (templates for OpenClaw sessions). Install presets below.')}
        actions={headerActions}
      />

      {(agentsQ.isError || marketplaceQ.isError || toggleEnabledM.isError || installM.isError) && (
        <div className="mt-4">
          <InlineAlert>
            {String(agentsQ.error ?? marketplaceQ.error ?? toggleEnabledM.error ?? installM.error)}
          </InlineAlert>
        </div>
      )}

      <section className="mt-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{t('Installed')}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t('Agents stored in your local SQLite database.')}</div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{t('{{count}} shown', { count: installedFiltered.length })}</span>
            {installedDisabled.length > 0 ? (
              <button
                type="button"
                className="rounded-md border border-border/70 bg-surface-2/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                onClick={() => setShowDisabled((v) => !v)}
              >
                {showDisabled ? t('Hide disabled') : t('Show disabled ({{count}})', { count: installedDisabled.length })}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3">
          {agentsQ.isLoading && installedAgents.length === 0 ? (
            <CardsSkeleton />
          ) : installedActive.length === 0 && installedDisabled.length === 0 ? (
            <div className="grid gap-3 rounded-2xl border border-border/70 bg-surface-1/70 p-6 shadow-panel">
              <EmptyState
                title={t('No agents installed')}
                subtitle={t('Install a preset below, or create a new custom agent.')}
              />
              <div>
                <Button
                  onClick={() => {
                    setDrawerAgent(null);
                    setDrawerOpen(true);
                  }}
                >
                  {t('Create agent')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6">
              {installedActive.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {installedActive.map((a) => (
                    <InstalledCard
                      key={a.id}
                      agent={a}
                      onConfigure={() => {
                        setDrawerAgent(a);
                        setDrawerOpen(true);
                      }}
                      onToggleEnabled={(next) => toggleEnabledM.mutate({ id: a.id, enabled: next })}
                      disabled={toggleEnabledM.isPending}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={t('No active agents')}
                  subtitle={t('Enable an installed agent, install a preset, or create a new custom agent.')}
                />
              )}

              {showDisabled && installedDisabled.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-muted-foreground">Disabled</div>
                    <div className="text-xs text-muted-foreground">{installedDisabled.length}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {installedDisabled.map((a) => (
                      <InstalledCard
                        key={a.id}
                        agent={a}
                        onConfigure={() => {
                          setDrawerAgent(a);
                          setDrawerOpen(true);
                        }}
                        onToggleEnabled={(next) => toggleEnabledM.mutate({ id: a.id, enabled: next })}
                        disabled={toggleEnabledM.isPending}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{t('Available presets')}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t('Install official presets. Pro items are visible but locked until subscriptions ship.')}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{t('{{count}} shown', { count: availableFiltered.length })}</div>
        </div>

        <div className="mt-3">
          {marketplaceQ.isLoading && availablePresets.length === 0 ? (
            <CardsSkeleton />
          ) : availableFiltered.length === 0 ? (
            <EmptyState
              title={t('No presets found')}
              subtitle={t('Try clearing search or changing the category filter.')}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {availableFiltered.map((p) => (
                <AvailableCard
                  key={p.preset_key}
                  preset={p}
                  onInstall={() => installM.mutate(p.preset_key)}
                  installing={installM.isPending && installM.variables === p.preset_key}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <AgentDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        agent={drawerAgent}
      />
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="rounded-xl border border-border/70 bg-surface-1/70 p-4 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-56" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

function InstalledCard({
  agent,
  onConfigure,
  onToggleEnabled,
  disabled,
}: {
  agent: Agent;
  onConfigure: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const skillsCount = agent.skills?.length ?? 0;
  const promptCount = countPromptOverrides(agent);
  const techParts = [
    `OpenClaw: ${agent.openclaw_agent_id ?? 'main'}`,
    `Skills: ${skillsCount}`,
    `Prompts: ${promptCount}`,
  ];

  const usageParts: string[] = [];
  usageParts.push(t('Used in {{count}} tasks', { count: agent.assigned_task_count ?? 0 }));
  if ((agent.run_count_7d ?? 0) > 0) usageParts.push(t('Runs 7d: {{count}}', { count: agent.run_count_7d }));
  if (agent.last_used_at) usageParts.push(t('Last used: {{value}}', { value: formatRelative(agent.last_used_at) }));

  return (
    <div
      className={[
        'rounded-xl border border-border/70 bg-surface-1/70 p-4 shadow-panel backdrop-blur',
        agent.enabled ? '' : 'opacity-75',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            <span className="mr-2">{agent.emoji ?? '🤖'}</span>
            {agent.display_name}
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {agent.description ?? '—'}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {techParts.map((t) => (
              <span key={t} className="whitespace-nowrap">
                {t.startsWith('OpenClaw: ') ? (
                  <>
                    OpenClaw:{' '}
                    <span className="font-mono text-foreground/90">{agent.openclaw_agent_id ?? 'main'}</span>
                  </>
                ) : (
                  t
                )}
              </span>
            ))}
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={onConfigure}>
          {t('Configure')}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
          {agent.category ?? 'general'}
        </Badge>
        {(agent.tags ?? []).slice(0, 3).map((t) => (
          <Badge key={t} variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
            {t}
          </Badge>
        ))}
        {agent.preset_key ? (
          <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
            {t('Preset')}
          </Badge>
        ) : null}
        {!agent.enabled ? (
          <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
            {t('Disabled')}
          </Badge>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">{usageParts.join(' · ')}</div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={agent.enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            disabled={disabled}
          />
          {t('Enabled')}
        </label>
      </div>
    </div>
  );
}

function AvailableCard({
  preset,
  onInstall,
  installing,
}: {
  preset: MarketplaceAgent;
  onInstall: () => void;
  installing: boolean;
}) {
  const { t } = useTranslation();
  const locked = preset.requires_subscription;
  const badgeLabel = locked ? t('Pro') : t('Free');

  return (
    <div className="rounded-xl border border-border/70 bg-surface-1/70 p-4 shadow-panel backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            <span className="mr-2">{preset.emoji ?? '🤖'}</span>
            {preset.display_name}
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{preset.description}</div>
        </div>
        <Button size="sm" onClick={onInstall} disabled={locked || installing}>
          {locked ? t('Locked') : installing ? t('Installing…') : t('Install')}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
          {preset.category ?? 'general'}
        </Badge>
        <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
          {badgeLabel}
        </Badge>
        {(preset.tags ?? []).slice(0, 3).map((t) => (
          <Badge key={t} variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
            {t}
          </Badge>
        ))}
      </div>

      {locked ? (
        <div className="mt-3 text-xs text-muted-foreground">{t('Subscription required (soon).')}</div>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">{t('Installs with OpenClaw agent id = “main”.')}</div>
      )}
    </div>
  );
}
