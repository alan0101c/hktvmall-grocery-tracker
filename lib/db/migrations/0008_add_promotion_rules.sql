CREATE TABLE IF NOT EXISTS promotion_rules (
  id serial PRIMARY KEY,
  label text NOT NULL,
  normalized_label text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  discount_percent numeric(5, 2),
  application text NOT NULL DEFAULT 'not_applicable',
  minimum_quantity integer,
  assumption text,
  first_seen_at timestamp NOT NULL DEFAULT now(),
  last_seen_at timestamp NOT NULL DEFAULT now(),
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS promotion_rule_id integer REFERENCES promotion_rules(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_application text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_minimum_quantity integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_assumption text;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS promotion_rule_id integer REFERENCES promotion_rules(id) ON DELETE SET NULL;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS discount_application text;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS discount_minimum_quantity integer;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS discount_assumption text;

INSERT INTO promotion_rules (
  label, normalized_label, status, application, reviewed_at
) VALUES
  ('65折換購家居保', '65折換購家居保', 'rejected', 'not_applicable', now()),
  ('64折買AXA旅遊保', '64折買axa旅遊保', 'rejected', 'not_applicable', now())
ON CONFLICT (normalized_label) DO NOTHING;

INSERT INTO promotion_rules (
  label, normalized_label, status, discount_percent, application,
  minimum_quantity, assumption, reviewed_at
) VALUES (
  '買2件95折', '買2件95折', 'approved', 5, 'conditional',
  2, 'Assumes purchase of at least 2 items', now()
)
ON CONFLICT (normalized_label) DO NOTHING;
