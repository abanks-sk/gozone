-- Clear stale demo clutter before a presentation.
--
-- Only touches rows created BEFORE today, so anything you create during the
-- demo is never affected. Nothing is deleted: statuses are moved to a terminal
-- value and the previous ones are saved in *_status_backup tables, so you can
-- undo with the UPDATE … FROM backup statements at the bottom.
--
-- Run once against BOTH databases (they are separate):
--   docker exec -i gozone-postgres psql -U gozone -d food_db < seed/99_clear_stale_demo_data.sql
--   docker exec -i gozone-postgres psql -U gozone -d ride_db < seed/99_clear_stale_demo_data.sql
-- Each half silently skips if the tables don't exist in that database.

\set ON_ERROR_STOP off

-- ── food_db: unfinished orders + people still "waiting" in the queue ──────────
CREATE TABLE IF NOT EXISTS orders_status_backup (id UUID PRIMARY KEY, status TEXT, saved_at TIMESTAMPTZ DEFAULT NOW());
INSERT INTO orders_status_backup (id, status)
SELECT id, status FROM orders
WHERE status NOT IN ('COMPLETED','CANCELLED') AND created_at < CURRENT_DATE
ON CONFLICT (id) DO NOTHING;

UPDATE orders SET status = 'CANCELLED'
WHERE status NOT IN ('COMPLETED','CANCELLED') AND created_at < CURRENT_DATE;

CREATE TABLE IF NOT EXISTS queue_status_backup (id UUID PRIMARY KEY, status TEXT, saved_at TIMESTAMPTZ DEFAULT NOW());
INSERT INTO queue_status_backup (id, status)
SELECT q.id, q.status FROM queue_entries q
JOIN orders o ON o.id = q.order_id
WHERE q.status IN ('WAITING','CALLED') AND o.created_at < CURRENT_DATE
ON CONFLICT (id) DO NOTHING;

UPDATE queue_entries q SET status = 'SERVED'
FROM orders o
WHERE o.id = q.order_id AND q.status IN ('WAITING','CALLED') AND o.created_at < CURRENT_DATE;

-- Orphans: an entry still waiting for an order that is already finished or
-- cancelled (any date). Left behind by cancellations made before the
-- FoodService fix that now clears the entry automatically.
INSERT INTO queue_status_backup (id, status)
SELECT q.id, q.status FROM queue_entries q
JOIN orders o ON o.id = q.order_id
WHERE q.status IN ('WAITING','CALLED') AND o.status IN ('COMPLETED','CANCELLED')
ON CONFLICT (id) DO NOTHING;

UPDATE queue_entries q SET status = 'SERVED'
FROM orders o
WHERE o.id = q.order_id AND q.status IN ('WAITING','CALLED') AND o.status IN ('COMPLETED','CANCELLED');

-- ── ride_db: trips left mid-flow ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips_status_backup (id UUID PRIMARY KEY, status TEXT, saved_at TIMESTAMPTZ DEFAULT NOW());
INSERT INTO trips_status_backup (id, status)
SELECT t.id, t.status FROM trips t
JOIN ride_requests r ON r.id = t.request_id
WHERE t.status NOT IN ('COMPLETED','CANCELLED') AND r.created_at < CURRENT_DATE
ON CONFLICT (id) DO NOTHING;

UPDATE trips t SET status = 'CANCELLED'
FROM ride_requests r
WHERE r.id = t.request_id
  AND t.status NOT IN ('COMPLETED','CANCELLED')
  AND r.created_at < CURRENT_DATE;

-- ── To undo (run in the matching database) ───────────────────────────────────
-- UPDATE orders o        SET status = b.status FROM orders_status_backup b WHERE b.id = o.id;
-- UPDATE queue_entries q SET status = b.status FROM queue_status_backup  b WHERE b.id = q.id;
-- UPDATE trips t         SET status = b.status FROM trips_status_backup  b WHERE b.id = t.id;
