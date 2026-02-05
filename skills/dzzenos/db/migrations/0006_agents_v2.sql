-- Agents roster v2 (presets + overlays)

ALTER TABLE agents ADD COLUMN description TEXT;
ALTER TABLE agents ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE agents ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE agents ADD COLUMN skills_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE agents ADD COLUMN prompt_overrides_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE agents ADD COLUMN preset_key TEXT;
ALTER TABLE agents ADD COLUMN preset_defaults_json TEXT;
ALTER TABLE agents ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category);
CREATE INDEX IF NOT EXISTS idx_agents_sort_order ON agents(sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_preset_key ON agents(preset_key) WHERE preset_key IS NOT NULL;
