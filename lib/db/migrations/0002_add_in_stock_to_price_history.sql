-- Migration: Add in_stock boolean column to price_history table
-- Backfill all existing rows to true (assumed in stock at time of recording).

ALTER TABLE price_history ADD COLUMN IF NOT EXISTS in_stock boolean NOT NULL DEFAULT true;
UPDATE price_history SET in_stock = true WHERE in_stock IS NULL;
