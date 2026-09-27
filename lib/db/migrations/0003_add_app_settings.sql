-- Migration: Add app-wide settings table (single row, id = 1).
-- global_discount_percent models sitewide promotions (e.g. "全場85折")
-- so displayed prices and alerts can reflect the effective price.

CREATE TABLE IF NOT EXISTS app_settings (
  id serial PRIMARY KEY,
  global_discount_percent numeric(5, 2) NOT NULL DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO app_settings (id, global_discount_percent)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;
