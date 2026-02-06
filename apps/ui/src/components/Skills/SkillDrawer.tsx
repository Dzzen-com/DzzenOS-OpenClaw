import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { InstalledSkill, SkillCapabilities } from '../../api/types';
import { createSkill, deleteSkill, patchSkill, resetSkill } from '../../api/queries';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';

function clampString(value: string, max: number) {
  const v = value.trim();
  if (v.length <= max) return v;
  return v.slice(0, max);
}

function uniqStrings(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function ChipInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface-2/50 px-2 py-0.5 text-xs text-foreground"
          >
            {v}
            <button
              type="button"
              className="rounded-full px-1 text-muted-foreground hover:text-foreground"
              onClick={() => onChange(value.filter((x) => x !== v))}
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder ?? t('Add…')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const next = uniqStrings([...value, ...draft.split(',').map((s) => s.trim())]);
            onChange(next);
            setDraft('');
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const next = uniqStrings([...value, ...draft.split(',').map((s) => s.trim())]);
            onChange(next);
            setDraft('');
          }}
          disabled={!draft.trim()}
        >
          {t('Add')}
        </Button>
      </div>
    </div>
  );
}

function emptyCaps(): SkillCapabilities {
  return {};
}

export function SkillDrawer({
  open,
  onOpenChange,
  skill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: InstalledSkill | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isCreate = !skill;

  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [tier, setTier] = useState<InstalledSkill['tier']>('community');
  const [enabled, setEnabled] = useState(true);
  const [caps, setCaps] = useState<SkillCapabilities>(emptyCaps());
  const [secrets, setSecrets] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (!skill) {
      setSlug('');
      setDisplayName('');
      setDescription('');
      setTier('community');
      setEnabled(true);
      setCaps(emptyCaps());
      setSecrets([]);
      return;
    }
    setSlug(skill.slug);
    setDisplayName(skill.display_name ?? '');
    setDescription(skill.description ?? '');
    setTier(skill.tier ?? 'community');
    setEnabled(Boolean(skill.enabled));
    setCaps(skill.capabilities ?? emptyCaps());
    setSecrets(skill.capabilities?.secrets ?? []);
  }, [open, skill?.slug]);

  const canReset = Boolean(skill?.preset_key);

  const payload = useMemo(() => {
    const nextCaps: SkillCapabilities = {
      network: caps.network ? true : undefined,
      filesystem: caps.filesystem ? true : undefined,
      external_write: caps.external_write ? true : undefined,
      secrets: uniqStrings(secrets),
    };
    if ((nextCaps.secrets?.length ?? 0) === 0) delete (nextCaps as any).secrets;
    return {
      slug: clampString(slug, 120),
      display_name: clampString(displayName, 160) || null,
      description: clampString(description, 2000) || null,
      tier,
      enabled,
      capabilities: nextCaps,
    };
  }, [slug, displayName, description, tier, enabled, caps, secrets]);

  const saveM = useMutation({
    mutationFn: async () => {
      if (isCreate) {
        return createSkill(payload);
      }
      return patchSkill(skill!.slug, {
        display_name: payload.display_name,
        description: payload.description,
        tier: payload.tier,
        enabled: payload.enabled,
        capabilities: payload.capabilities,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['skills'] });
      await qc.invalidateQueries({ queryKey: ['marketplace-skills'] });
      onOpenChange(false);
    },
  });

  const resetM = useMutation({
    mutationFn: async () => resetSkill(skill!.slug),
    onSuccess: async (s) => {
      await qc.invalidateQueries({ queryKey: ['skills'] });
      await qc.invalidateQueries({ queryKey: ['marketplace-skills'] });
      setDisplayName(s.display_name ?? '');
      setDescription(s.description ?? '');
      setTier(s.tier ?? 'official');
      setEnabled(Boolean(s.enabled));
      setCaps(s.capabilities ?? emptyCaps());
      setSecrets(s.capabilities?.secrets ?? []);
    },
  });

  const uninstallM = useMutation({
    mutationFn: async () => deleteSkill(skill!.slug),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['skills'] });
      await qc.invalidateQueries({ queryKey: ['marketplace-skills'] });
      onOpenChange(false);
    },
  });

  const errorText = String(saveM.error ?? resetM.error ?? uninstallM.error ?? '');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed right-0 top-0 z-[60] h-dvh w-full max-w-xl border-l border-border/70 bg-surface-1/85 p-4 shadow-popover backdrop-blur outline-none sm:p-6"
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold tracking-tight">
                {isCreate ? t('Add skill') : (skill?.display_name ?? skill?.slug ?? t('Skill'))}
              </Dialog.Title>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {!isCreate ? (
                  <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
                    <span className="font-mono">{skill?.slug}</span>
                  </Badge>
                ) : null}
                {skill?.preset_key ? (
                  <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
                    Preset
                  </Badge>
                ) : null}
              </div>
            </div>
            <Dialog.Close asChild aria-label="Close">
              <Button variant="ghost">{t('Close')}</Button>
            </Dialog.Close>
          </div>

          {(saveM.isError || resetM.isError || uninstallM.isError) ? (
            <div className="mt-4">
              <InlineAlert>{errorText}</InlineAlert>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            <Row label={t('Slug (id)')}>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="github"
                disabled={!isCreate}
              />
              <div className="mt-2 text-xs text-muted-foreground">{t('Used as the skill id (stored in agent profiles).')}</div>
            </Row>

            <Row label={t('Display name (optional)')}>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="GitHub" />
            </Row>

            <Row label={t('Description (optional)')}>
              <textarea
                className="w-full resize-y rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder={t('Description')}
              />
            </Row>

            <div className="grid gap-3 sm:grid-cols-2">
              <Row label={t('Tier')}>
                <select
                  className="h-9 w-full rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm text-foreground"
                  value={tier}
                  onChange={(e) => setTier(e.target.value as InstalledSkill['tier'])}
                >
                  <option value="official">official</option>
                  <option value="verified">verified</option>
                  <option value="community">community</option>
                </select>
              </Row>
              <Row label={t('Enabled')}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                  <span className="text-sm text-muted-foreground">{t('Active')}</span>
                </div>
              </Row>
            </div>

            <div className="rounded-xl border border-border/70 bg-surface-2/40 p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('Capabilities')}</div>
              <div className="mt-3 grid gap-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(caps.network)}
                    onChange={(e) => setCaps((c) => ({ ...c, network: e.target.checked }))}
                  />
                  {t('Network access')}
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(caps.filesystem)}
                    onChange={(e) => setCaps((c) => ({ ...c, filesystem: e.target.checked }))}
                  />
                  {t('Filesystem access')}
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(caps.external_write)}
                    onChange={(e) => setCaps((c) => ({ ...c, external_write: e.target.checked }))}
                  />
                  {t('External write actions')}
                </label>
                <div className="pt-2">
                  <ChipInput label={t('Secrets (names)')} value={secrets} onChange={setSecrets} placeholder="GITHUB_TOKEN" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {!isCreate ? (
                <>
                  {canReset ? (
                    <Button variant="secondary" onClick={() => resetM.mutate()} disabled={resetM.isPending}>
                      {resetM.isPending ? t('Resetting…') : t('Reset')}
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!window.confirm(t('Uninstall skill "{{name}}"?', { name: skill!.display_name ?? skill!.slug }))) return;
                      uninstallM.mutate();
                    }}
                    disabled={uninstallM.isPending}
                  >
                    {uninstallM.isPending ? t('Uninstalling…') : t('Uninstall')}
                  </Button>
                </>
              ) : null}
            </div>
            <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || (isCreate && !payload.slug)}>
              {saveM.isPending ? t('Saving…') : t('Save')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
