-- Migration: track products that are no longer available on HKTVmall.
-- When a refresh can no longer parse the product page (delisted/removed),
-- the product is flagged status='unavailable' and the failure is recorded in
-- last_refresh_error. The row and its price history are kept.

ALTER TABLE products ADD COLUMN status text NOT NULL DEFAULT 'active';
ALTER TABLE products ADD COLUMN last_refresh_error text;

COMMENT ON COLUMN products.status IS 'active | unavailable (no longer listed on HKTVmall)';
COMMENT ON COLUMN products.last_refresh_error IS 'Message from the last failed refresh, if any';
