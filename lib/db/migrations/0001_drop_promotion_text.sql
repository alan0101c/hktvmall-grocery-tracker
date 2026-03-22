-- Migration: Drop legacy promotion_text column from products and price_history
-- The promotion_text column was a scalar copy of the first element of promotion_texts (jsonb array).
-- Having both caused duplicate promo tags in the UI. Consolidating to promotion_texts only.

ALTER TABLE products DROP COLUMN IF EXISTS promotion_text;
ALTER TABLE price_history DROP COLUMN IF EXISTS promotion_text;
