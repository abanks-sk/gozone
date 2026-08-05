-- Wipe every trace of testing, so the system looks like it has never been used.
--
-- This is the harder version of 99_clear_stale_demo_data.sql. That one is reversible and only
-- touches yesterday's rows; this one DELETES, and it deletes everything transactional regardless
-- of age. Use it once, before a demo, when the accumulated debris of hundreds of test runs —
-- dead delivery jobs in the courier feed, 83 SOS alerts, ride requests from last week — is the
-- thing making the product look unfinished.
--
-- ⚠️ WHAT IT DOES NOT TOUCH: user accounts, vendors, menus, KYC, saved cards.
--
-- That is deliberate. Deleting users would sign every phone out mid-demo and force each app to
-- be re-registered, and the seeded accounts are referenced by fixed UUID from three other seed
-- files and from scripts/e2e.sh. "Feels new" means no leftover jobs, not no people.
--
-- Wallet balances ARE reset, because a balance is the sum of a ledger that is about to be
-- deleted — leaving them would show money with nothing behind it.
--
-- Run against each database in turn (they are separate):
--   docker exec -i gozone-postgres psql -U gozone -d ride_db   < seed/00_reset_transactional.sql
--   docker exec -i gozone-postgres psql -U gozone -d food_db   < seed/00_reset_transactional.sql
--   docker exec -i gozone-postgres psql -U gozone -d wallet_db < seed/00_reset_transactional.sql
-- Each half silently skips the tables that don't exist in that database.

\set ON_ERROR_STOP off

-- ── ride_db ──────────────────────────────────────────────────────────────────
-- Order matters: children before parents, or the foreign keys refuse.
DELETE FROM pickup_disputes;
DELETE FROM ride_ratings;
DELETE FROM sos_incidents;
DELETE FROM trip_passengers;
DELETE FROM bids;
DELETE FROM trips;
DELETE FROM ride_requests;
DELETE FROM driver_locations;

-- ── food_db ──────────────────────────────────────────────────────────────────
DELETE FROM food_ratings;
DELETE FROM queue_entries;
DELETE FROM deliveries;
DELETE FROM order_item_addons;
DELETE FROM order_items;
DELETE FROM orders;

-- ── wallet_db ────────────────────────────────────────────────────────────────
DELETE FROM ledger_entries;
DELETE FROM withdrawals;
DELETE FROM notifications;
-- Back to zero, not to a made-up float: every balance is derived from the ledger just deleted.
UPDATE wallets SET balance = 0;
