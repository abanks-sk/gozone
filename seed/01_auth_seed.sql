-- Demo seed for auth_db
-- Passwords are not used — auth is OTP-based. UUIDs are fixed for cross-service FK references.

\c auth_db;

INSERT INTO users (id, phone, role, status, created_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '+233201000001', 'RIDER',             'ACTIVE', NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000002', '+233201000002', 'DRIVER',            'ACTIVE', NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000003', '+233201000003', 'DRIVER',            'ACTIVE', NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000004', '+233201000004', 'RESTAURANT_OWNER',  'ACTIVE', NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000005', '+233201000005', 'COURIER',           'ACTIVE', NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000006', '+233201000006', 'ADMIN',             'ACTIVE', NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000007', '+233201000007', 'RIDER',             'ACTIVE', NOW())
ON CONFLICT (phone) DO NOTHING;

-- Pre-approve KYC for demo drivers
INSERT INTO driver_kyc (id, user_id, licence_no, vehicle_reg, roadworthy_url, id_selfie_url, status)
VALUES
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002', 'GH-LIC-2001', 'GR-1234-22', 'https://placeholder.example/kyc/d1-road.pdf', 'https://placeholder.example/kyc/d1-selfie.jpg', 'VERIFIED'),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000003', 'GH-LIC-2002', 'GR-5678-22', 'https://placeholder.example/kyc/d2-road.pdf', 'https://placeholder.example/kyc/d2-selfie.jpg', 'VERIFIED'),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000005', 'GH-LIC-2003', 'GR-9012-22', 'https://placeholder.example/kyc/c1-road.pdf', 'https://placeholder.example/kyc/c1-selfie.jpg', 'VERIFIED')
ON CONFLICT DO NOTHING;
