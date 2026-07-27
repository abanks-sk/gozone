-- Per-dish preparation time.
--
-- Prep time lived only on the vendor as one flat number, so a bottle of water and a full grill
-- were quoted identically. That number drives the walk-in "when should I leave?" estimate, which
-- is only as good as its worst input.
--
-- NULL means "no per-dish time set", and the vendor's flat prep_minutes stands in. Existing items
-- therefore keep behaving exactly as they do today until a vendor fills one in.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS prep_minutes INT;
