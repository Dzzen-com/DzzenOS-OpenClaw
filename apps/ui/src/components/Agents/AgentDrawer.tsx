import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Agent, PromptOverrides } from '../../api/types';
import { createAgent, deleteAgent, duplicateAgent, patchAgent, resetAgent } from '../../api/queries';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';

type TabKey = 'overview' | 'prompts' | 'skills' | 'usage';

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
          placeholder={placeholder ?? 'Add…'}
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
          Add
        </Button>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">Tip: press Enter or separate multiple items with commas.</div>
    </div>
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 6,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      className="w-full resize-y rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
    />
  );
}

function emptyPromptOverrides(): PromptOverrides {
  return {};
}

export function AgentDrawer({
  open,
  onOpenChange,
  agent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent | null;
}) {
  const qc = useQueryClient();
  const isCreate = !agent;
  const [tab, setTab] = useState<TabKey>('overview');

  const [displayName, setDisplayName] = useState('');
  const [emoji, setEmoji] = useState<string>('');
  const [openclawAgentId, setOpenclawAgentId] = useState('main');
  const [enabled, setEnabled] = useState(true);
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<PromptOverrides>(emptyPromptOverrides());

  useEffect(() => {
    if (!open) return;
    setTab('overview');
    if (!agent) {
      setDisplayName('');
      setEmoji('');
      setOpenclawAgentId('main');
      setEnabled(true);
      setRole('orchestrator');
      setDescription('');
      setCategory('general');
      setTags([]);
      setSkills([]);
      setPrompts(emptyPromptOverrides());
      return;
    }

    setDisplayName(agent.display_name ?? '');
    setEmoji(agent.emoji ?? '');
    setOpenclawAgentId(agent.openclaw_agent_id ?? 'main');
    setEnabled(Boolean(agent.enabled));
    setRole(agent.role ?? '');
    setDescription(agent.description ?? '');
    setCategory(agent.category ?? 'general');
    setTags(agent.tags ?? []);
    setSkills(agent.skills ?? []);
    setPrompts(agent.prompt_overrides ?? emptyPromptOverrides());
  }, [open, agent?.id]);

  const canReset = Boolean(agent?.preset_key);
  const canDelete = Boolean(agent && !agent.preset_key);

  const dirtyPayload = useMemo(
    () => ({
      display_name: clampString(displayName, 120),
      emoji: clampString(emoji, 24) || null,
      openclaw_agent_id: clampString(openclawAgentId, 120),
      enabled,
      role: clampString(role, 80) || null,
      description: clampString(description, 2000) || null,
      category: clampString(category, 80) || 'general',
      tags: uniqStrings(tags),
      skills: uniqStrings(skills),
      prompt_overrides: {
        system: prompts.system?.trim() || undefined,
        plan: prompts.plan?.trim() || undefined,
        execute: prompts.execute?.trim() || undefined,
        chat: prompts.chat?.trim() || undefined,
        report: prompts.report?.trim() || undefined,
      } satisfies PromptOverrides,
    }),
    [displayName, emoji, openclawAgentId, enabled, role, description, category, tags, skills, prompts],
  );

  const saveM = useMutation({
    mutationFn: async () => {
      if (isCreate) {
        return createAgent(dirtyPayload);
      }
      return patchAgent(agent.id, dirtyPayload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agents'] });
      await qc.invalidateQueries({ queryKey: ['marketplace-agents'] });
      onOpenChange(false);
    },
  });

  const resetM = useMutation({
    mutationFn: async () => resetAgent(agent!.id),
    onSuccess: async (a) => {
      await qc.invalidateQueries({ queryKey: ['agents'] });
      await qc.invalidateQueries({ queryKey: ['marketplace-agents'] });
      setDisplayName(a.display_name ?? '');
      setEmoji(a.emoji ?? '');
      setOpenclawAgentId(a.openclaw_agent_id ?? 'main');
      setEnabled(Boolean(a.enabled));
      setRole(a.role ?? '');
      setDescription(a.description ?? '');
      setCategory(a.category ?? 'general');
      setTags(a.tags ?? []);
      setSkills(a.skills ?? []);
      setPrompts(a.prompt_overrides ?? emptyPromptOverrides());
    },
  });

  const duplicateM = useMutation({
    mutationFn: async () => duplicateAgent(agent!.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agents'] });
      await qc.invalidateQueries({ queryKey: ['marketplace-agents'] });
    },
  });

  const deleteM = useMutation({
    mutationFn: async () => deleteAgent(agent!.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agents'] });
      await qc.invalidateQueries({ queryKey: ['marketplace-agents'] });
      onOpenChange(false);
    },
  });

  const errorText = String(saveM.error ?? resetM.error ?? duplicateM.error ?? deleteM.error ?? '');

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
                {isCreate ? 'New agent' : `${agent?.emoji ?? '🤖'} ${agent?.display_name ?? 'Agent'}`}
              </Dialog.Title>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {agent?.preset_key ? (
                  <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
                    Preset
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
                    Custom
                  </Badge>
                )}
                {agent && !agent.enabled ? (
                  <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
                    Disabled
                  </Badge>
                ) : null}
              </div>
            </div>
            <Dialog.Close asChild aria-label="Close">
              <Button variant="ghost">Close</Button>
            </Dialog.Close>
          </div>

          {(saveM.isError || resetM.isError || duplicateM.isError || deleteM.isError) && (
            <div className="mt-4">
              <InlineAlert>{errorText}</InlineAlert>
            </div>
          )}

          <div className="mt-5">
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
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
                <TabsTrigger value="usage" className="text-[11px] sm:text-xs" disabled={isCreate}>
                  Usage
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <div className="grid gap-3">
                  <Row label="Display name">
                    <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Agent name" />
                  </Row>
                  <Row label="Description">
                    <Textarea value={description} onChange={setDescription} placeholder="What this agent is best at…" rows={4} />
                  </Row>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Row label="Emoji">
                      <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🤖" />
                    </Row>
                    <Row label="Category">
                      <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="general" />
                    </Row>
                  </div>
                  <Row label="OpenClaw agent id">
                    <Input
                      value={openclawAgentId}
                      onChange={(e) => setOpenclawAgentId(e.target.value)}
                      placeholder="main"
                    />
                  </Row>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Row label="Role (optional)">
                      <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="orchestrator" />
                    </Row>
                    <Row label="Enabled">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => setEnabled(e.target.checked)}
                        />
                        <span className="text-sm text-muted-foreground">Active</span>
                      </div>
                    </Row>
                  </div>
                  <ChipInput label="Tags" value={tags} onChange={setTags} placeholder="e.g. content, social, research" />
                </div>
              </TabsContent>

              <TabsContent value="prompts">
                <div className="grid gap-4">
                  <PromptBlock
                    title="System"
                    hint="High-level behavior and constraints for this agent."
                    value={prompts.system ?? ''}
                    onChange={(v) => setPrompts((p) => ({ ...p, system: v }))}
                  />
                  <PromptBlock
                    title="Plan"
                    hint="How the agent plans tasks."
                    value={prompts.plan ?? ''}
                    onChange={(v) => setPrompts((p) => ({ ...p, plan: v }))}
                  />
                  <PromptBlock
                    title="Execute"
                    hint="How the agent executes tasks."
                    value={prompts.execute ?? ''}
                    onChange={(v) => setPrompts((p) => ({ ...p, execute: v }))}
                  />
                  <PromptBlock
                    title="Chat"
                    hint="How the agent replies in task chat."
                    value={prompts.chat ?? ''}
                    onChange={(v) => setPrompts((p) => ({ ...p, chat: v }))}
                  />
                  <PromptBlock
                    title="Report"
                    hint="How the agent summarizes outcomes."
                    value={prompts.report ?? ''}
                    onChange={(v) => setPrompts((p) => ({ ...p, report: v }))}
                  />
                </div>
              </TabsContent>

              <TabsContent value="skills">
                <div className="grid gap-4">
                  <ChipInput label="Skills" value={skills} onChange={setSkills} placeholder="skill id (string)" />
                  <div className="text-xs text-muted-foreground">
                    Skills are stored as expected skill ids. Execution integration ships in a later version.
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="usage">
                {agent ? (
                  <div className="grid gap-3 text-sm">
                    <div className="rounded-xl border border-border/70 bg-surface-2/40 p-4">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Usage (read-only)
                      </div>
                      <div className="mt-3 grid gap-2">
                        <UsageRow label="Assigned tasks" value={String(agent.assigned_task_count ?? 0)} />
                        <UsageRow label="Runs (7d)" value={String(agent.run_count_7d ?? 0)} />
                        <UsageRow label="Last used" value={agent.last_used_at ? new Date(agent.last_used_at).toLocaleString() : '—'} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Save the agent to see usage stats.</div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {agent ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => duplicateM.mutate()}
                    disabled={duplicateM.isPending}
                    title="Create a custom copy"
                  >
                    {duplicateM.isPending ? 'Duplicating…' : 'Duplicate'}
                  </Button>
                  {canReset ? (
                    <Button
                      variant="secondary"
                      onClick={() => resetM.mutate()}
                      disabled={resetM.isPending}
                      title="Reset to preset defaults"
                    >
                      {resetM.isPending ? 'Resetting…' : 'Reset'}
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      variant="secondary"
                      onClick={() => deleteM.mutate()}
                      disabled={deleteM.isPending}
                      title="Delete agent"
                    >
                      {deleteM.isPending ? 'Deleting…' : 'Delete'}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
                {saveM.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
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

function PromptBlock({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-surface-2/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <div className="mt-3">
        <Textarea value={value} onChange={onChange} placeholder={`${title} prompt…`} rows={6} />
      </div>
    </div>
  );
}

function UsageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  );
}
