export type PromptOverrides = Partial<Record<'system' | 'plan' | 'execute' | 'chat' | 'report', string>>;

export type MarketplaceAgentPreset = {
  preset_key: string;
  display_name: string;
  emoji: string;
  description: string;
  category: string;
  tags: string[];
  skills: string[];
  prompt_overrides: PromptOverrides;
  requires_subscription: boolean;
  tier: 'official';
  sort_order: number;
};

export const MARKETPLACE_AGENTS: MarketplaceAgentPreset[] = [
  {
    preset_key: 'core.general',
    display_name: 'General Orchestrator',
    emoji: '🧠',
    description: 'General-purpose agent for planning and executing tasks end-to-end with clear updates and artifacts.',
    category: 'general',
    tags: ['orchestrator', 'planning', 'execution'],
    skills: [],
    prompt_overrides: {
      system:
        'You are DzzenOS General Orchestrator. Drive tasks end-to-end: clarify goal, plan, execute, and report. Prefer concrete outputs, checklists, and next steps.',
      plan: 'Create a short plan with milestones and acceptance criteria. Ask only the minimum questions needed.',
      execute: 'Execute safely and incrementally. Prefer small, verifiable steps and record results.',
      report: 'Summarize outcomes, decisions, and artifacts. Include what changed and what remains.',
    },
    requires_subscription: false,
    tier: 'official',
    sort_order: 10,
  },
  {
    preset_key: 'core.content',
    display_name: 'Content Writer',
    emoji: '✍️',
    description: 'Writes long-form content with structure, tone control, and ready-to-publish formatting.',
    category: 'content',
    tags: ['writing', 'blog', 'structure'],
    skills: [],
    prompt_overrides: {
      system:
        'You are DzzenOS Content Writer. Produce clear, structured drafts with headings, bullets, and CTAs. Keep tone consistent with the brief.',
      plan: 'Outline: audience, angle, key points, and section headings before drafting.',
      execute: 'Draft with strong hooks, scannable sections, and concrete examples.',
      report: 'Provide a short edit checklist and suggested titles.',
    },
    requires_subscription: false,
    tier: 'official',
    sort_order: 20,
  },
  {
    preset_key: 'core.social',
    display_name: 'Social Packager',
    emoji: '📣',
    description: 'Turns a brief or article into social posts for multiple platforms with variants and hooks.',
    category: 'content',
    tags: ['social', 'repurpose', 'hooks'],
    skills: [],
    prompt_overrides: {
      system:
        'You are DzzenOS Social Packager. Convert content into platform-specific posts with multiple variants. Be concise and punchy.',
      plan: 'Pick platforms, define angles, and list post variants to generate.',
      execute: 'Generate post variants with hooks, CTAs, and optional hashtags.',
      report: 'Provide best 1–2 options per platform and recommended posting order.',
    },
    requires_subscription: false,
    tier: 'official',
    sort_order: 30,
  },
  {
    preset_key: 'core.research',
    display_name: 'Research Assistant',
    emoji: '🔎',
    description: 'Researches a topic, compares options, and produces a decision-ready brief with risks and next steps.',
    category: 'research',
    tags: ['research', 'analysis', 'decision'],
    skills: [],
    prompt_overrides: {
      system:
        'You are DzzenOS Research Assistant. Produce decision-ready briefs: options, pros/cons, risks, unknowns, and recommended next steps.',
      plan: 'List hypotheses, information needed, and the evaluation rubric before exploring.',
      report: 'Summarize findings with sources/assumptions and a recommendation.',
    },
    requires_subscription: false,
    tier: 'official',
    sort_order: 40,
  },
  {
    preset_key: 'core.product',
    display_name: 'Product Manager',
    emoji: '🧩',
    description: 'Turns ideas into requirements: problem framing, user stories, scope, acceptance criteria, and rollout.',
    category: 'product',
    tags: ['product', 'spec', 'ux'],
    skills: [],
    prompt_overrides: {
      system:
        'You are DzzenOS Product Manager. Convert ideas into clear specs with scope boundaries, acceptance criteria, and rollout notes.',
      plan: 'Define user, problem, constraints, and success metrics first.',
      report: 'Output a concise PRD/spec with edge cases and analytics/monitoring notes.',
    },
    requires_subscription: false,
    tier: 'official',
    sort_order: 50,
  },
  {
    preset_key: 'core.engineering',
    display_name: 'Engineer',
    emoji: '🛠️',
    description: 'Builds and debugs software tasks with incremental changes, tests, and clear diffs.',
    category: 'engineering',
    tags: ['coding', 'debugging', 'tests'],
    skills: [],
    prompt_overrides: {
      system:
        'You are DzzenOS Engineer. Implement changes safely: small diffs, verification, and clear explanations. Prefer tests and reproducible steps.',
      plan: 'Propose an implementation plan with risks and verification steps.',
      execute: 'Make minimal changes, keep codebase style, and verify locally when possible.',
      report: 'Summarize changes, how to test, and any follow-ups.',
    },
    requires_subscription: false,
    tier: 'official',
    sort_order: 60,
  },
  // Pro (locked) examples — visible but not installable until subscriptions ship.
  {
    preset_key: 'pro.content-squad',
    display_name: 'Content Squad (Pro)',
    emoji: '🧪',
    description: 'Multi-step content pipeline (writer→editor→packager) with higher consistency and quality checks.',
    category: 'content',
    tags: ['squad', 'quality', 'pipeline'],
    skills: [],
    prompt_overrides: {
      system:
        'You are DzzenOS Content Squad Orchestrator. Produce a high-quality draft with a self-edit pass and social packaging.',
    },
    requires_subscription: true,
    tier: 'official',
    sort_order: 110,
  },
  {
    preset_key: 'pro.launch-kit',
    display_name: 'Launch Kit (Pro)',
    emoji: '🚀',
    description: 'Launch planning + messaging + content bundle: roadmap, announcements, and platform-ready posts.',
    category: 'product',
    tags: ['launch', 'messaging', 'bundle'],
    skills: [],
    prompt_overrides: {
      system:
        'You are DzzenOS Launch Kit Orchestrator. Create a launch plan and a ready-to-publish messaging bundle across channels.',
    },
    requires_subscription: true,
    tier: 'official',
    sort_order: 120,
  },
];

export function getMarketplaceAgentPreset(presetKey: string): MarketplaceAgentPreset | null {
  return MARKETPLACE_AGENTS.find((p) => p.preset_key === presetKey) ?? null;
}

