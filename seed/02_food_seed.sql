-- Demo seed for food_db
-- Restaurant owner UUID matches auth_db seed

\c food_db;

INSERT INTO restaurants (id, owner_id, name, lat, lng, status, prep_minutes, vendor_type)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'Kofi Kitchen', 5.6037, -0.1870, 'OPEN', 15, 'RESTAURANT'),
  ('bbbbbbbb-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'Accra Grill House', 5.6102, -0.2010, 'OPEN', 20, 'RESTAURANT'),
  -- Non-food vendors: same ordering/queue/delivery primitives, different goods.
  ('bbbbbbbb-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'MedPlus Pharmacy', 5.6075, -0.1925, 'OPEN', 10, 'PHARMACY'),
  ('bbbbbbbb-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'FreshMart Grocery', 5.5990, -0.1995, 'OPEN', 25, 'GROCERY'),
  -- Deliberately ~20 km east, in Tema. The other four sit within about two kilometres of each
  -- other in central Accra, which makes a courier's progress almost invisible on the tracking
  -- map — you cannot tell a moving marker from a stuck one at that scale. Order from here to
  -- watch a delivery actually travel. It also exercises the distance-based delivery fee, which
  -- is otherwise always near its floor.
  ('bbbbbbbb-0000-0000-0000-000000000005',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'Tema Harbour Grill', 5.6698, -0.0166, 'OPEN', 20, 'RESTAURANT')
ON CONFLICT (id) DO NOTHING;

-- Idempotent: matched on (restaurant, name), because the ids are generated at
-- insert time so ON CONFLICT (id) never fires — re-running this file used to add
-- a fresh copy of every item and customers saw each dish two or three times.
-- Items a vendor added or edited themselves are left untouched.
INSERT INTO menu_items (id, restaurant_id, name, price, available)
SELECT gen_random_uuid(), v.restaurant_id, v.name, v.price, true
FROM (VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'Jollof Rice',        18.00),
  ('bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'Waakye',             16.00),
  ('bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'Kelewele',            8.00),
  ('bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'Iced Sobolo',         5.00),
  ('bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'Grilled Tilapia',    35.00),
  ('bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'Banku + Okro',       20.00),
  ('bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'Fufu + Light Soup',  22.00),
  ('bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'Malt Drink',          6.00),
  -- Pharmacy items
  ('bbbbbbbb-0000-0000-0000-000000000003'::uuid, 'Paracetamol 500mg (10s)', 12.00),
  ('bbbbbbbb-0000-0000-0000-000000000003'::uuid, 'Vitamin C 1000mg',        25.00),
  ('bbbbbbbb-0000-0000-0000-000000000003'::uuid, 'Hand Sanitizer 250ml',    18.00),
  ('bbbbbbbb-0000-0000-0000-000000000003'::uuid, 'Surgical Face Mask (5s)',  9.00),
  -- Grocery items
  ('bbbbbbbb-0000-0000-0000-000000000004'::uuid, 'Fresh Milk 1L',           14.00),
  ('bbbbbbbb-0000-0000-0000-000000000004'::uuid, 'Sliced Bread',            10.00),
  ('bbbbbbbb-0000-0000-0000-000000000004'::uuid, 'Eggs (crate of 30)',      45.00),
  ('bbbbbbbb-0000-0000-0000-000000000004'::uuid, 'Perfumed Rice 5kg',       80.00),
  ('bbbbbbbb-0000-0000-0000-000000000004'::uuid, 'Cooking Oil 2L',          38.00),
  -- Tema (the far vendor, for watching a delivery actually cover ground)
  ('bbbbbbbb-0000-0000-0000-000000000005'::uuid, 'Grilled Red Snapper',     48.00),
  ('bbbbbbbb-0000-0000-0000-000000000005'::uuid, 'Harbour Prawns',          65.00),
  ('bbbbbbbb-0000-0000-0000-000000000005'::uuid, 'Yam Chips',               15.00),
  ('bbbbbbbb-0000-0000-0000-000000000005'::uuid, 'Sobolo (large)',           8.00)
) AS v(restaurant_id, name, price)
WHERE NOT EXISTS (
  SELECT 1 FROM menu_items m
  WHERE m.restaurant_id = v.restaurant_id AND m.name = v.name
);
