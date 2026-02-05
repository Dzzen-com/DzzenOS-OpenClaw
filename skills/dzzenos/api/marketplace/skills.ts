export type SkillCapabilities = {
  network?: boolean;
  filesystem?: boolean;
  external_write?: boolean;
  secrets?: string[];
};

export type MarketplaceSkillPreset = {
  preset_key: string;
  slug: string;
  display_name: string;
  description: string;
  tier: 'official';
  capabilities: SkillCapabilities;
  requires_subscription: boolean;
  sort_order: number;
};

export const MARKETPLACE_SKILLS: MarketplaceSkillPreset[] = [
  {
    preset_key: 'core.github',
    slug: 'github',
    display_name: 'GitHub',
    description: 'Repo operations, issues/PR workflows, and automation helpers.',
    tier: 'official',
    capabilities: { network: true, secrets: ['GITHUB_TOKEN'] },
    requires_subscription: false,
    sort_order: 10,
  },
  {
    preset_key: 'core.email',
    slug: 'email',
    display_name: 'Email',
    description: 'Send email messages and notifications (approval-gated in future).',
    tier: 'official',
    capabilities: { external_write: true, secrets: ['SMTP_URL'] },
    requires_subscription: false,
    sort_order: 20,
  },
  {
    preset_key: 'core.telegram',
    slug: 'telegram',
    display_name: 'Telegram',
    description: 'Send messages to Telegram chats/channels (approval-gated in future).',
    tier: 'official',
    capabilities: { external_write: true, secrets: ['TELEGRAM_BOT_TOKEN'] },
    requires_subscription: false,
    sort_order: 30,
  },
  {
    preset_key: 'core.x',
    slug: 'x',
    display_name: 'X / Twitter',
    description: 'Publish posts (approval-gated in future).',
    tier: 'official',
    capabilities: { external_write: true, secrets: ['X_API_KEY'] },
    requires_subscription: false,
    sort_order: 40,
  },
  {
    preset_key: 'core.rss',
    slug: 'rss',
    display_name: 'RSS',
    description: 'Fetch and parse RSS feeds.',
    tier: 'official',
    capabilities: { network: true },
    requires_subscription: false,
    sort_order: 50,
  },
  {
    preset_key: 'core.web',
    slug: 'web',
    display_name: 'Web',
    description: 'Web browsing and extraction tools (policy-gated in future).',
    tier: 'official',
    capabilities: { network: true },
    requires_subscription: false,
    sort_order: 60,
  },
  // Pro locked examples — visible but not installable until subscriptions ship.
  {
    preset_key: 'pro.social-publisher',
    slug: 'social_publisher',
    display_name: 'Social Publisher (Pro)',
    description: 'Publishing pipeline across platforms with approvals and scheduling.',
    tier: 'official',
    capabilities: { external_write: true, secrets: [] },
    requires_subscription: true,
    sort_order: 110,
  },
  {
    preset_key: 'pro.crm',
    slug: 'crm',
    display_name: 'CRM (Pro)',
    description: 'Lead tracking and outbound automation connectors.',
    tier: 'official',
    capabilities: { external_write: true, secrets: [] },
    requires_subscription: true,
    sort_order: 120,
  },
];

export function getMarketplaceSkillPreset(presetKey: string): MarketplaceSkillPreset | null {
  return MARKETPLACE_SKILLS.find((p) => p.preset_key === presetKey) ?? null;
}

