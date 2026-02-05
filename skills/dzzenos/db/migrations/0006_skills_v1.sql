-- Skills (v1): installed skills registry for DzzenOS (local-first)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS installed_skills (
  slug TEXT PRIMARY KEY,
  display_name TEXT,
  description TEXT,
  tier TEXT NOT NULL DEFAULT 'community'
    CHECK (tier IN ('official','verified','community')),
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','marketplace')),
  preset_key TEXT,
  preset_defaults_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_installed_skills_enabled ON installed_skills(enabled);
CREATE INDEX IF NOT EXISTS idx_installed_skills_tier ON installed_skills(tier);
CREATE INDEX IF NOT EXISTS idx_installed_skills_sort_order ON installed_skills(sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_installed_skills_preset_key ON installed_skills(preset_key) WHERE preset_key IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_installed_skills_updated_at
AFTER UPDATE ON installed_skills
FOR EACH ROW
BEGIN
  UPDATE installed_skills
     SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE slug = OLD.slug;
END;

