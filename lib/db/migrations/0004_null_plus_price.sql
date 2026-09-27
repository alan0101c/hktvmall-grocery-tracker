-- Migration: HKTVmall cancelled the Plus membership.
-- Clear stale Plus member prices from the current products table so the UI
-- never offers a defunct member price as the current price.
-- price_history rows are intentionally kept untouched as historical record.

UPDATE products SET plus_price = NULL WHERE plus_price IS NOT NULL;
