-- Remove duplicated catalogue items.
--
-- `02_food_seed.sql` used to INSERT unconditionally, so every re-run (the
-- rebuild instructions say to re-run it) added another copy of every item —
-- customers saw each dish two or three times. The seed is now idempotent; this
-- script cleans up databases that were already seeded more than once.
--
--   docker exec -i gozone-postgres psql -U gozone -d food_db < seed/98_dedupe_menu_items.sql
--
-- Deleted rows are copied to menu_items_removed_backup first. Any order lines
-- pointing at a removed copy are repointed to the surviving item (the copies are
-- identical in name and price, so history is unaffected).

BEGIN;

-- Survivor per (restaurant, item name): prefer one already referenced by an
-- order so we repoint as little as possible; otherwise the lowest id.
CREATE TEMP TABLE keepers AS
SELECT DISTINCT ON (mi.restaurant_id, mi.name)
       mi.id AS keep_id, mi.restaurant_id, mi.name
FROM menu_items mi
ORDER BY mi.restaurant_id, mi.name,
         (EXISTS (SELECT 1 FROM order_items oi WHERE oi.menu_item_id = mi.id)) DESC,
         mi.id;

CREATE TABLE IF NOT EXISTS menu_items_removed_backup (LIKE menu_items);
INSERT INTO menu_items_removed_backup
SELECT mi.* FROM menu_items mi
JOIN keepers k ON k.restaurant_id = mi.restaurant_id AND k.name = mi.name
WHERE mi.id <> k.keep_id;

UPDATE order_items oi SET menu_item_id = k.keep_id
FROM menu_items mi
JOIN keepers k ON k.restaurant_id = mi.restaurant_id AND k.name = mi.name
WHERE oi.menu_item_id = mi.id AND mi.id <> k.keep_id;

DELETE FROM menu_items mi
USING keepers k
WHERE k.restaurant_id = mi.restaurant_id AND k.name = mi.name AND mi.id <> k.keep_id;

COMMIT;

SELECT r.name AS vendor, count(*) AS items
FROM menu_items mi JOIN restaurants r ON r.id = mi.restaurant_id
GROUP BY r.name ORDER BY r.name;
