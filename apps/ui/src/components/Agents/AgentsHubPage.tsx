import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import {
  getOrchestrationPreview,
  listAgents,
  listSubagents,
  patchOrchestrationPolicy,
  replaceSubagents,
} from '../../api/queries';
import { PageHeader } from '../Layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { AgentsPage } from './AgentsPage';
import { ModelsPage } from '../Models/ModelsPage';
import { SkillsPage } from '../Skills/SkillsPage';

type AgentsTab = 'overview' | 'models' | 'profiles' | 'subagents' | 'skills' | 'orchestration';

function safeJsonParse(input: string, fallback: Record<string, unknown>) {
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return fallback;
  } catch {
    return fallback;
  }
}

function localLabel(tab: AgentsTab, t: (s: string) => string) {
  if (tab === 'overview') return t('Overview');
  if (tab === 'models') return t('Models');
  if (tab === 'profiles') return t('Profiles');
  if (tab === 'subagents') return t('Subagents');
  if (tab === 'skills') return t('Skills');
  return t('Orchestration');
}

export function AgentsHubPage({
  tab,
  onSelectTab,
}: {
  tab: AgentsTab;
  onSelectTab: (tab: AgentsTab) => void;
}) {
  const { t } = useTranslation();
  const agentsQ = useQuery({ queryKey: ['agents'], queryFn: listAgents });

  const tabs: AgentsTab[] = ['overview', 'models', 'profiles', 'subagents', 'skills', 'orchestration'];

  const content =
    tab === 'profiles' ? (
      <AgentsPage />
    ) : tab === 'models' ? (
      <ModelsPage />
    ) : tab === 'skills' ? (
      <SkillsPage />
    ) : tab === 'subagents' || tab === 'orchestration' ? (
      <AgentsOrchestrationEditor mode={tab} />
    ) : (
      <Card>
        <CardHeader>
          <CardTitle>{t('Agents Overview')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground">
          <div>{t('Profiles')}: {agentsQ.data?.length ?? 0}</div>
          <div>{t('Enabled')}: {(agentsQ.data ?? []).filter((a) => a.enabled).length}</div>
          <div>{t('OpenClaw orchestration mode')}: openclaw</div>
        </CardContent>
      </Card>
    );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('Agents')} subtitle={t('Agent profiles, models, skills and sub-agent orchestration.')} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[220px,1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t('Agent menu')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onSelectTab(item)}
                className={
                  'rounded-md border px-3 py-2 text-left text-sm transition ' +
                  (item === tab
                    ? 'border-primary/60 bg-surface-2/80 text-foreground'
                    : 'border-border/70 bg-surface-1/50 text-muted-foreground hover:bg-surface-2/60')
                }
              >
                {localLabel(item, t)}
              </button>
            ))}
          </CardContent>
        </Card>
        <div>{content}</div>
      </div>
    </div>
  );
}

function AgentsOrchestrationEditor({
  mode,
}: {
  mode: 'subagents' | 'orchestration';
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const agentsQ = useQuery({ queryKey: ['agents'], queryFn: listAgents });
  const agents = agentsQ.data ?? [];
  const [agentId, setAgentId] = useState<string>('');

  useEffect(() => {
    if (agentId) return;
    const first = agents[0];
    if (first) setAgentId(first.id);
  }, [agentId, agents]);

  const subagentsQ = useQuery({
    queryKey: ['agent-subagents', agentId],
    queryFn: () => listSubagents(agentId),
    enabled: !!agentId,
  });
  const previewQ = useQuery({
    queryKey: ['agent-orchestration-preview', agentId],
    queryFn: () => getOrchestrationPreview(agentId),
    enabled: !!agentId,
  });

  const [draftRows, setDraftRows] = useState<
    Array<{
      child_agent_id: string;
      role: string;
      trigger_rules_json: string;
      max_calls: number;
    }>
  >([]);
  useEffect(() => {
    setDraftRows(
      (subagentsQ.data ?? []).map((row) => ({
        child_agent_id: row.child_agent_id,
        role: row.role,
        trigger_rules_json: JSON.stringify(row.trigger_rules_json ?? {}, null, 2),
        max_calls: row.max_calls,
      }))
    );
  }, [subagentsQ.data]);

  const [budgetText, setBudgetText] = useState('{}');
  const [rulesText, setRulesText] = useState('{}');
  useEffect(() => {
    setBudgetText(JSON.stringify(previewQ.data?.policy?.delegation_budget_json ?? { max_total_calls: 8, max_parallel: 2 }, null, 2));
    setRulesText(JSON.stringify(previewQ.data?.policy?.escalation_rules_json ?? {}, null, 2));
  }, [previewQ.data?.policy?.delegation_budget_json, previewQ.data?.policy?.escalation_rules_json]);

  const replaceM = useMutation({
    mutationFn: async () =>
      replaceSubagents(
        agentId,
        draftRows
          .filter((row) => row.child_agent_id)
          .map((row, index) => ({
            child_agent_id: row.child_agent_id,
            role: row.role,
            trigger_rules_json: safeJsonParse(row.trigger_rules_json, {}),
            max_calls: row.max_calls,
            order: index,
          }))
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agent-subagents', agentId] });
      await qc.invalidateQueries({ queryKey: ['agent-orchestration-preview', agentId] });
    },
  });

  const patchPolicyM = useMutation({
    mutationFn: async () =>
      patchOrchestrationPolicy(agentId, {
        mode: 'openclaw',
        delegation_budget_json: safeJsonParse(budgetText, { max_total_calls: 8, max_parallel: 2 }),
        escalation_rules_json: safeJsonParse(rulesText, {}),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agent-orchestration-preview', agentId] });
    },
  });

  if (!agents.length) {
    return <InlineAlert>{t('No agents found. Create an agent profile first.')}</InlineAlert>;
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('Target agent')}</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="h-9 w-full rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.display_name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {mode === 'subagents' ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('Subagents')}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setDraftRows((prev) => [
                    ...prev,
                    { child_agent_id: '', role: '', trigger_rules_json: '{}', max_calls: 3 },
                  ])
                }
              >
                {t('Add')}
              </Button>
              <Button size="sm" onClick={() => replaceM.mutate()} disabled={replaceM.isPending}>
                {replaceM.isPending ? t('Saving…') : t('Save')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {draftRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t('No subagents configured.')}</div>
            ) : (
              draftRows.map((row, idx) => (
                <div key={idx} className="rounded-md border border-border/70 bg-surface-2/40 p-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    <select
                      className="h-9 rounded-md border border-input/70 bg-surface-1/70 px-2 text-sm"
                      value={row.child_agent_id}
                      onChange={(e) =>
                        setDraftRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, child_agent_id: e.target.value } : r))
                        )
                      }
                    >
                      <option value="">{t('Select child agent')}</option>
                      {agents
                        .filter((agent) => agent.id !== agentId)
                        .map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.display_name}
                          </option>
                        ))}
                    </select>
                    <input
                      className="h-9 rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm"
                      placeholder={t('Role')}
                      value={row.role}
                      onChange={(e) =>
                        setDraftRows((prev) => prev.map((r, i) => (i === idx ? { ...r, role: e.target.value } : r)))
                      }
                    />
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr,120px]">
                    <textarea
                      className="min-h-[88px] rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-xs font-mono"
                      value={row.trigger_rules_json}
                      onChange={(e) =>
                        setDraftRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, trigger_rules_json: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      type="number"
                      className="h-9 rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm"
                      value={row.max_calls}
                      onChange={(e) =>
                        setDraftRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, max_calls: Number(e.target.value) || 1 } : r))
                        )
                      }
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('Orchestration policy')}</CardTitle>
            <Button size="sm" onClick={() => patchPolicyM.mutate()} disabled={patchPolicyM.isPending}>
              {patchPolicyM.isPending ? t('Saving…') : t('Save')}
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">{t('Delegation budget (JSON)')}</div>
              <textarea
                className="min-h-[120px] w-full rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-xs font-mono"
                value={budgetText}
                onChange={(e) => setBudgetText(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">{t('Escalation rules (JSON)')}</div>
              <textarea
                className="min-h-[120px] w-full rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-xs font-mono"
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
              />
            </div>
            <div className="rounded-md border border-border/70 bg-surface-2/40 p-3">
              <div className="mb-1 text-xs text-muted-foreground">{t('OpenClaw preview')}</div>
              <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap text-xs text-foreground">
                {previewQ.data?.preview ?? t('No preview yet')}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {replaceM.isError || patchPolicyM.isError ? (
        <InlineAlert>{String(replaceM.error ?? patchPolicyM.error)}</InlineAlert>
      ) : null}
    </div>
  );
}
