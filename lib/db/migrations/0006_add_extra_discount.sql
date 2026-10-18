-- Per-product extra-off campaign parsed from the HKTVmall price tag
-- (div.marketing-label-description), e.g. 「今日85折」 -> 15, 「今日95折」 -> 5.
-- Nullable: old rows predate scraping of this field.
-- products = latest scrape state; price_history = frozen per scrape.
ALTER TABLE products ADD COLUMN IF NOT EXISTS extra_discount_percent numeric(5, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS extra_discount_label text;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS extra_discount_percent numeric(5, 2);
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS extra_discount_label text;
