-- Who placed this order, in words rather than a UUID.
--
-- A vendor packing a bag and a courier handing it over both need to know who they are looking
-- for, and `customer_id` is not something you can read out at a counter. Stamped on the order at
-- checkout rather than joined at read time: names live in auth_db, no service reads another
-- service's database, and fanning out to auth-service once per row on every board refresh would
-- be a request storm for something that changes about never.
--
-- Denormalising also keeps the right answer. This is who ordered it *then* — if somebody renames
-- their account next week, the handover record should not quietly rewrite itself.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name  VARCHAR(120);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20);
