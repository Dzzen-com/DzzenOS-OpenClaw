import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';

import type { Agent } from '../../api/types';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { Input } from '../ui/Input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { Badge } from '../ui/Badge';

type PromptKey = 'system' | 'plan' | 'execute' | 'chat' | 'report';

type Draft = {
  display_name: string;
  description: string;
  emoji: string;
  openclaw_agent_id: string;
  enabled: boolean;
  role: string;
  category: string;
  tags: string[];
  skills: string[];
  prompt_overrides: Record<PromptKey, string>;
};

function normalizeList(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const it of raw) {
    const s = typeof it === 'string' ? it.trim() : String(it ?? '').trim();
    if (!s) continue;
    out.push(s);
  }
  return Array.from(new Set(out));
}

function draftFromAgent(a: Agent | null): Draft {
  return {
    display_name: a?.display_name ?? '',
    description: a?.description ?? '',
    emoji: a?.emoji ?? '',
    openclaw_agent_id: a?.openclaw_agent_id ?? '',
    enabled: a?.enabled ?? true,
    role: a?.role ?? 'orchestrator',
    category: a?.category ?? 'general',
    tags: normalizeList(a?.tags),
    skills: normalizeList(a?.skills),
    prompt_overrides: {
      system: a?.prompt_overrides?.system ?? '',
      plan: a?.prompt_overrides?.plan ?? '',
      execute: a?.prompt_overrides?.execute ?? '',
      chat: a?.prompt_overrides?.chat ?? '',
      report: a?.prompt_overrides?.report ?? '',
    },
  };
}

function toNullableString(s: string): string | null {
  const v = s.trim();
  return v ? v : null;
}

function toPromptPatch(p: Record<PromptKey, string>) {
  const out: Record<string, string> = {};
  (Object.keys(p) as PromptKey[]).forEach((k) => {
    const v = p[k].trim();
    if (v) out[k] = v;
  });
  return out;
}

function ChipEditor({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const next = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!next.length) return;
    onChange(Array.from(new Set([...(values ?? []), ...next])));
    setDraft('');
  };

  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {(values ?? []).length ? (
          (values ?? []).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface-2/50 px-2 py-1 text-xs text-foreground"
            >
              {t}
              <button
                type="button"
                className="ml-1 rounded-full px-1 text-muted-foreground hover:text-foreground"
                onClick={() => onChange((values ?? []).filter((x) => x !== t))}
                aria-label={`Remove ${t}`}
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        )}
      </div>
      <div className="mt-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
        />
        <div className="mt-2 text-xs text-muted-foreground">Press Enter to add. Commas add multiple.</div>
      </div>
    </div>
  );
}

export function AgentDrawer({
  open,
  agent,
  mode,
  openclawHref,
  error,
  busy,
  onOpenChange,
  onCreate,
  onSave,
  onReset,
  onDuplicate,
  onDelete,
}: {
  open: boolean;
  agent: Agent | null;
  mode: 'create' | 'edit';
  openclawHref: string;
  error?: string | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: Partial<Agent> & { display_name: string; openclaw_agent_id: string }) => void;
  onSave: (patch: Partial<Agent>) => void;
  onReset: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const isPreset = Boolean(agent?.preset_key);
  const [tab, setTab] = useState<'overview' | 'prompts' | 'skills' | 'usage'>('overview');
  const [draft, setDraft] = useState<Draft>(() => draftFromAgent(agent));

  useEffect(() => {
    setDraft(draftFromAgent(agent));
    setTab('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id, open]);

  const canSave = draft.display_name.trim() && draft.openclaw_agent_id.trim();

  const placeholderHint = useMemo(() => {
    const id = draft.openclaw_agent_id.trim();
    if (!id) return null;
    const looksPlaceholder =
      id.startsWith('dzzenos-') || id.startsWith('dzzenos:') || id.includes('-copy-');
    if (!looksPlaceholder) return null;
    return 'This looks like a placeholder OpenClaw agent id. Update it to the real OpenClaw agent you want to run.';
  }, [draft.openclaw_agent_id]);

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
                {mode === 'create' ? 'New agent' : draft.display_name.trim() || 'Agent'}
              </Dialog.Title>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {isPreset ? (
                  <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
                    Preset
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
                    Custom
                  </Badge>
                )}
                {agent?.enabled === false ? (
                  <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
                    Disabled
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => window.open(openclawHref, '_blank', 'noreferrer')}
                title="Open OpenClaw UI"
              >
                OpenClaw
              </Button>
              <Dialog.Close asChild aria-label="Close">
                <Button variant="ghost">Close</Button>
              </Dialog.Close>
            </div>
          </div>

          {error ? (
            <div className="mt-4">
              <InlineAlert>{error}</InlineAlert>
            </div>
          ) : null}
          {placeholderHint ? (
            <div className="mt-4">
              <InlineAlert>{placeholderHint}</InlineAlert>
            </div>
          ) : null}

          <div className="mt-5">
            <Tabs value={tab} defaultValue="overview" onValueChange={(v) => setTab(v as any)}>
              <TabsList className="w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="overview" className="text-[11px] sm:text-xs">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="prompts" className="text-[11px] sm:text-xs">
                  Prompts
                </TabsTrigger>
                <TabsTrigger value="skills" className="text-[11px] sm:text-xs">
                  Skills
                </TabsTrigger>
                <TabsTrigger value="usage" className="text-[11px] sm:text-xs">
                  Usage
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <div className="grid gap-3">
                  <Row label="Display name">
                    <Input
                      value={draft.display_name}
                      onChange={(e) => setDraft((d) => ({ ...d, display_name: e.target.value }))}
                      placeholder="e.g. Content Orchestrator"
                    />
                  </Row>

                  <Row label="Description">
                    <textarea
                      className="min-h-[84px] w-full resize-none rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      placeholder="What this agent does…"
                    />
                  </Row>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Row label="Emoji">
                      <Input
                        value={draft.emoji}
                        onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))}
                        placeholder="🧠"
                      />
                    </Row>
                    <Row label="Category">
                      <Input
                        value={draft.category}
                        onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                        placeholder="general / content / social…"
                      />
                    </Row>
                  </div>

                  <Row label="OpenClaw agent id">
                    <Input
                      value={draft.openclaw_agent_id}
                      onChange={(e) => setDraft((d) => ({ ...d, openclaw_agent_id: e.target.value }))}
                      placeholder="main"
                    />
                    <div className="mt-2 text-xs text-muted-foreground">
                      This must match an existing agent id in OpenClaw. If you don’t have one yet, open OpenClaw and
                      create it first.
                    </div>
                  </Row>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Row label="Role">
                      <Input
                        value={draft.role}
                        onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                        placeholder="orchestrator"
                      />
                    </Row>
                    <Row label="Enabled">
                      <div className="flex h-9 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
                        />
                        <span className="text-sm text-muted-foreground">Active</span>
                      </div>
                    </Row>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="prompts">
                <div className="grid gap-4">
                  <PromptField
                    label="System"
                    value={draft.prompt_overrides.system}
                    onChange={(v) => setDraft((d) => ({ ...d, prompt_overrides: { ...d.prompt_overrides, system: v } }))}
                    help="Applied as an overlay system instruction by DzzenOS (future integration)."
                  />
                  <PromptField
                    label="Plan"
                    value={draft.prompt_overrides.plan}
                    onChange={(v) => setDraft((d) => ({ ...d, prompt_overrides: { ...d.prompt_overrides, plan: v } }))}
                    help="Used for planning mode."
                  />
                  <PromptField
                    label="Execute"
                    value={draft.prompt_overrides.execute}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, prompt_overrides: { ...d.prompt_overrides, execute: v } }))
                    }
                    help="Used for execution mode."
                  />
                  <PromptField
                    label="Chat"
                    value={draft.prompt_overrides.chat}
                    onChange={(v) => setDraft((d) => ({ ...d, prompt_overrides: { ...d.prompt_overrides, chat: v } }))}
                    help="Used as a chat behavior overlay."
                  />
                  <PromptField
                    label="Report"
                    value={draft.prompt_overrides.report}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, prompt_overrides: { ...d.prompt_overrides, report: v } }))
                    }
                    help="Used for summary/report mode."
                  />
                </div>
              </TabsContent>

              <TabsContent value="skills">
                <div className="grid gap-4">
                  <ChipEditor
                    label="Tags"
                    values={draft.tags}
                    placeholder="founder, execution, content…"
                    onChange={(tags) => setDraft((d) => ({ ...d, tags }))}
                  />
                  <ChipEditor
                    label="Skills"
                    values={draft.skills}
                    placeholder="dzzenos-operator, playwright…"
                    onChange={(skills) => setDraft((d) => ({ ...d, skills }))}
                  />
                </div>
              </TabsContent>

              <TabsContent value="usage">
                <div className="grid gap-3">
                  <UsageRow label="Used in tasks">{String(agent?.assigned_task_count ?? 0)}</UsageRow>
                  <UsageRow label="Runs (7d)">{String(agent?.run_count_7d ?? 0)}</UsageRow>
                  <UsageRow label="Last used">{agent?.last_used_at ?? '—'}</UsageRow>
                  <div className="text-xs text-muted-foreground">
                    Assignment lives in Kanban/Automations. This page is just the library and presets.
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {mode === 'edit' ? (
                <>
                  {isPreset ? (
                    <Button variant="secondary" onClick={() => onReset()} disabled={busy}>
                      Reset
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={() => onDuplicate()} disabled={busy}>
                    Duplicate
                  </Button>
                  {!isPreset ? (
                    <Button variant="destructive" onClick={() => onDelete()} disabled={busy}>
                      Delete
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  const patch: Partial<Agent> = {
                    display_name: draft.display_name.trim(),
                    description: toNullableString(draft.description),
                    emoji: toNullableString(draft.emoji),
                    openclaw_agent_id: draft.openclaw_agent_id.trim(),
                    enabled: draft.enabled,
                    role: toNullableString(draft.role),
                    category: draft.category.trim() || 'general',
                    tags: draft.tags,
                    skills: draft.skills,
                    prompt_overrides: toPromptPatch(draft.prompt_overrides),
                  };

                  if (mode === 'create') {
                    onCreate(patch as any);
                    return;
                  }
                  onSave(patch);
                }}
                disabled={busy || !canSave}
                title={!canSave ? 'Display name and OpenClaw agent id are required' : undefined}
              >
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function UsageRow({ label, children }: { label: string; children: any }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-surface-2/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xs text-foreground">{children}</div>
    </div>
  );
}

function PromptField({
  label,
  value,
  help,
  onChange,
}: {
  label: string;
  value: string;
  help: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{help}</div>
      </div>
      <textarea
        className="mt-2 min-h-[84px] w-full resize-none rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Optional ${label.toLowerCase()} override…`}
      />
    </div>
  );
}
