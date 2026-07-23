-- Demo seed for wallet_db
-- Platform wallet has a float balance for demo payouts

\c wallet_db;

-- Platform wallet
INSERT INTO wallets (id, owner_id, owner_type, balance)
VALUES ('00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        'PLATFORM', 10000.00)
ON CONFLICT (owner_id, owner_type) DO NOTHING;

-- Driver wallets (zero balance, earnings come from trip settlements)
INSERT INTO wallets (id, owner_id, owner_type, balance)
VALUES
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002', 'DRIVER', 0.00),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000003', 'DRIVER', 0.00),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000005', 'DRIVER', 0.00)
ON CONFLICT (owner_id, owner_type) DO NOTHING;

-- Rider wallets
INSERT INTO wallets (id, owner_id, owner_type, balance)
VALUES
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'RIDER', 200.00),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000007', 'RIDER', 150.00)
ON CONFLICT (owner_id, owner_type) DO NOTHING;

-- Restaurant wallet
INSERT INTO wallets (id, owner_id, owner_type, balance)
VALUES
  (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 'RESTAURANT', 0.00),
  (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', 'RESTAURANT', 0.00)
ON CONFLICT (owner_id, owner_type) DO NOTHING;

-- Commission rates already seeded in V1__baseline.sql (RIDE=0.18, FOOD=0.12)
-- This is a no-op reminder, actual values come from migration.
