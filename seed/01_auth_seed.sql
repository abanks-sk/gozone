-- Demo seed for auth_db
-- Passwords are not used — auth is OTP-based. UUIDs are fixed for cross-service FK references.

\c auth_db;

-- `app` places each account in one front-end: identity is unique per app, not platform-wide, so
-- the conflict target is the pair. A courier belongs to the driver app — same app, parcel instead
-- of passenger.
INSERT INTO users (id, phone, app, role, status, created_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '+233201000001', 'PASSENGER', 'RIDER',             'ACTIVE', NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000002', '+233201000002', 'DRIVER',    'DRIVER',            'ACTIVE', NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000003', '+233201000003', 'DRIVER',    'DRIVER',            'ACTIVE', NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000004', '+233201000004', 'VENDOR',    'RESTAURANT_OWNER',  'ACTIVE', NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000005', '+233201000005', 'DRIVER',    'COURIER',           'ACTIVE', NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000006', '+233201000006', 'ADMIN',     'ADMIN',             'ACTIVE', NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000007', '+233201000007', 'PASSENGER', 'RIDER',             'ACTIVE', NOW())
ON CONFLICT (phone, app) DO NOTHING;

-- Pre-approve KYC for demo drivers.
--
-- Document URLs are deliberately NULL. They used to be `https://placeholder.example/kyc/...`,
-- which was harmless while nothing ever displayed them — but the admin review page now renders
-- the actual images, and a link to a domain that does not exist renders as a broken document
-- against a driver marked VERIFIED. "No documents on file" is the truth about these seeded
-- historical approvals; a dead link is not.
--
-- Idempotent on (user_id, licence_no): the ids are generated at insert time, so `ON CONFLICT (id)`
-- never fires and re-running this file used to add another copy of every row — the same bug that
-- once triplicated the food menu.
INSERT INTO driver_kyc (id, user_id, licence_no, vehicle_reg, status)
SELECT gen_random_uuid(), v.user_id, v.licence_no, v.vehicle_reg, 'VERIFIED'
FROM (VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'GH-LIC-2001', 'GR-1234-22'),
  ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'GH-LIC-2002', 'GR-5678-22'),
  ('aaaaaaaa-0000-0000-0000-000000000005'::uuid, 'GH-LIC-2003', 'GR-9012-22')
) AS v(user_id, licence_no, vehicle_reg)
WHERE NOT EXISTS (
  SELECT 1 FROM driver_kyc k WHERE k.user_id = v.user_id AND k.licence_no = v.licence_no
);
