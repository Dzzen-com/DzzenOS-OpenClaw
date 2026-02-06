import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { InstalledSkill, MarketplaceSkill, SkillCapabilities } from '../../api/types';
import {
  deleteSkill,
  installMarketplaceSkill,
  listMarketplaceSkills,
  listSkills,
  patchSkill,
} from '../../api/queries';
import { PageHeader } from '../Layout/PageHeader';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { InlineAlert } from '../ui/InlineAlert';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { SkillDrawer } from './SkillDrawer';

function queryTokens(q: string): string[] {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesTokens(haystack: string, tokens: string[]) {
  if (!tokens.length) return true;
  const hay = haystack.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

function isTypingElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function capabilityLabels(c: SkillCapabilities | null | undefined): string[] {
  const out: string[] = [];
  if (c?.network) out.push('network');
  if (c?.filesystem) out.push('filesystem');
  if (c?.external_write) out.push('external_write');
  if ((c?.secrets?.length ?? 0) > 0) out.push('secrets');
  return out;
}

function tierVariant(tier: InstalledSkill['tier']): 'outline' | 'info' | 'success' {
  if (tier === 'official') return 'info';
  if (tier === 'verified') return 'success';
  return 'outline';
}

function skillHaystack(s: { slug: string; display_name?: string | null; description?: string | null; tier?: string; capabilities?: SkillCapabilities }) {
  return [
    s.display_name ?? '',
    s.slug ?? '',
    s.description ?? '',
    s.tier ?? '',
    ...capabilityLabels(s.capabilities),
  ].join(' ');
}

export function SkillsPage() {
  const qc = useQueryClient();

  const searchRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSkill, setDrawerSkill] = useState<InstalledSkill | null>(null);

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
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [search]);

  const skillsQ = useQuery({ queryKey: ['skills'], queryFn: listSkills });
  const marketplaceQ = useQuery({ queryKey: ['marketplace-skills'], queryFn: listMarketplaceSkills });

  const toggleEnabledM = useMutation({
    mutationFn: async (vars: { slug: string; enabled: boolean }) => patchSkill(vars.slug, { enabled: vars.enabled }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['skills'] });
      await qc.invalidateQueries({ queryKey: ['marketplace-skills'] });
    },
  });

  const uninstallM = useMutation({
    mutationFn: async (slug: string) => deleteSkill(slug),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['skills'] });
      await qc.invalidateQueries({ queryKey: ['marketplace-skills'] });
    },
  });

  const installM = useMutation({
    mutationFn: async (presetKey: string) => installMarketplaceSkill(presetKey),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['skills'] });
      await qc.invalidateQueries({ queryKey: ['marketplace-skills'] });
    },
  });

  const installedSkills = skillsQ.data ?? [];
  const availablePresets = (marketplaceQ.data ?? [])
    .filter((p) => !p.installed)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const tokens = useMemo(() => queryTokens(search), [search]);

  const installedFiltered = useMemo(() => {
    if (!tokens.length) return installedSkills;
    return installedSkills.filter((s) => matchesTokens(skillHaystack(s), tokens));
  }, [installedSkills, tokens]);

  const installedActive = useMemo(() => installedFiltered.filter((s) => s.enabled), [installedFiltered]);
  const installedDisabled = useMemo(() => installedFiltered.filter((s) => !s.enabled), [installedFiltered]);

  const availableFiltered = useMemo(() => {
    if (!tokens.length) return availablePresets;
    return availablePresets.filter((s) => matchesTokens(skillHaystack(s), tokens));
  }, [availablePresets, tokens]);

  const showClear = search.trim().length > 0;

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Skills"
        subtitle="Installed skills and available presets."
        actions={
          <div className="w-full sm:w-auto">
            <div className="rounded-xl border border-border/70 bg-gradient-to-b from-surface-2/70 to-surface-1/70 p-2 shadow-panel backdrop-blur">
              <div className="flex w-full flex-col gap-2 lg:w-[620px] lg:flex-row lg:items-end">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">Search skills</label>
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
                      placeholder="Name, slug, description, tier, capabilities..."
                      className="bg-background/35 pl-9 pr-12"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border/80 bg-surface-2/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      /
                    </span>
                  </div>
                </div>
                {showClear ? (
                  <Button variant="ghost" className="lg:self-end" onClick={() => setSearch('')}>
                    Clear
                  </Button>
                ) : null}
                <Button
                  className="lg:self-end"
                  onClick={() => {
                    setDrawerSkill(null);
                    setDrawerOpen(true);
                  }}
                >
                  Add skill
                </Button>
              </div>
            </div>
          </div>
        }
      />

      {(skillsQ.isError || marketplaceQ.isError || toggleEnabledM.isError || uninstallM.isError || installM.isError) ? (
        <InlineAlert>
          {String(skillsQ.error ?? marketplaceQ.error ?? toggleEnabledM.error ?? uninstallM.error ?? installM.error)}
        </InlineAlert>
      ) : null}

      <section className="mt-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Installed</div>
            <div className="mt-1 text-xs text-muted-foreground">Skills installed in your local SQLite database.</div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{installedFiltered.length} shown</span>
            {installedDisabled.length > 0 ? (
              <button
                type="button"
                className="rounded-md border border-border/70 bg-surface-2/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                onClick={() => setShowDisabled((v) => !v)}
              >
                {showDisabled ? 'Hide disabled' : `Show disabled (${installedDisabled.length})`}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3">
          {skillsQ.isLoading && installedSkills.length === 0 ? (
            <CardsSkeleton />
          ) : installedActive.length === 0 && installedDisabled.length === 0 ? (
            <EmptyState title="No skills installed" subtitle="Install presets below or add one manually." />
          ) : (
            <div className="grid gap-6">
              {installedActive.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {installedActive.map((s) => (
                    <InstalledSkillCard
                      key={s.slug}
                      skill={s}
                      onConfigure={() => {
                        setDrawerSkill(s);
                        setDrawerOpen(true);
                      }}
                      onToggleEnabled={(next) => toggleEnabledM.mutate({ slug: s.slug, enabled: next })}
                      onUninstall={() => {
                        if (!window.confirm(`Uninstall skill "${s.display_name ?? s.slug}"?`)) return;
                        uninstallM.mutate(s.slug);
                      }}
                      busy={toggleEnabledM.isPending || uninstallM.isPending}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState title="No active skills" subtitle="Enable an installed skill, install a preset, or add a new one." />
              )}

              {showDisabled && installedDisabled.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-muted-foreground">Disabled</div>
                    <div className="text-xs text-muted-foreground">{installedDisabled.length}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {installedDisabled.map((s) => (
                      <InstalledSkillCard
                        key={s.slug}
                        skill={s}
                        onConfigure={() => {
                          setDrawerSkill(s);
                          setDrawerOpen(true);
                        }}
                        onToggleEnabled={(next) => toggleEnabledM.mutate({ slug: s.slug, enabled: next })}
                        onUninstall={() => {
                          if (!window.confirm(`Uninstall skill "${s.display_name ?? s.slug}"?`)) return;
                          uninstallM.mutate(s.slug);
                        }}
                        busy={toggleEnabledM.isPending || uninstallM.isPending}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="mt-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Available presets</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Install official presets. Pro items are visible but locked until subscriptions ship.
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{availableFiltered.length} shown</div>
        </div>

        <div className="mt-3">
          {marketplaceQ.isLoading && availablePresets.length === 0 ? (
            <CardsSkeleton />
          ) : availableFiltered.length === 0 ? (
            <EmptyState title="No presets found" subtitle="Try clearing search." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {availableFiltered.map((p) => (
                <AvailableSkillCard
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

      <SkillDrawer open={drawerOpen} onOpenChange={setDrawerOpen} skill={drawerSkill} />
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

function CapabilityBadges({ caps }: { caps: SkillCapabilities }) {
  const labels = capabilityLabels(caps);
  if (!labels.length) return null;
  const secretsCount = caps.secrets?.length ?? 0;
  return (
    <>
      {caps.network ? (
        <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
          Network
        </Badge>
      ) : null}
      {caps.filesystem ? (
        <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
          Files
        </Badge>
      ) : null}
      {caps.external_write ? (
        <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
          Write
        </Badge>
      ) : null}
      {secretsCount > 0 ? (
        <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
          Secrets:{' '}
          <span className="ml-1 font-mono text-foreground/90">{secretsCount}</span>
        </Badge>
      ) : null}
    </>
  );
}

function InstalledSkillCard({
  skill,
  onConfigure,
  onToggleEnabled,
  onUninstall,
  busy,
}: {
  skill: InstalledSkill;
  onConfigure: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onUninstall: () => void;
  busy?: boolean;
}) {
  const name = skill.display_name ?? skill.slug;
  const tier = (skill.tier ?? 'community') as InstalledSkill['tier'];
  const caps = skill.capabilities ?? {};

  return (
    <div
      className={[
        'rounded-xl border border-border/70 bg-surface-1/70 p-4 shadow-panel backdrop-blur',
        skill.enabled ? '' : 'opacity-75',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{skill.description ?? '—'}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="font-mono text-foreground/90">{skill.slug}</span>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={onConfigure}>
          Configure
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant={tierVariant(tier)} className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
          {tier}
        </Badge>
        <CapabilityBadges caps={caps} />
        {skill.preset_key ? (
          <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
            Preset
          </Badge>
        ) : null}
        {!skill.enabled ? (
          <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
            Disabled
          </Badge>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onUninstall}
          disabled={busy}
          title="Uninstall skill"
        >
          Uninstall
        </button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={skill.enabled} onChange={(e) => onToggleEnabled(e.target.checked)} disabled={busy} />
          Enabled
        </label>
      </div>
    </div>
  );
}

function AvailableSkillCard({
  preset,
  onInstall,
  installing,
}: {
  preset: MarketplaceSkill;
  onInstall: () => void;
  installing: boolean;
}) {
  const locked = preset.requires_subscription;
  const badgeLabel = locked ? 'Pro' : 'Free';
  const caps = preset.capabilities ?? {};

  return (
    <div className="rounded-xl border border-border/70 bg-surface-1/70 p-4 shadow-panel backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{preset.display_name}</div>
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{preset.description}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="font-mono text-foreground/90">{preset.slug}</span>
          </div>
        </div>
        <Button size="sm" onClick={onInstall} disabled={locked || installing}>
          {locked ? 'Locked' : installing ? 'Installing…' : 'Install'}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="info" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
          {preset.tier}
        </Badge>
        <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
          {badgeLabel}
        </Badge>
        <CapabilityBadges caps={caps} />
      </div>

      {locked ? (
        <div className="mt-3 text-xs text-muted-foreground">Subscription required (soon).</div>
      ) : null}
    </div>
  );
}
