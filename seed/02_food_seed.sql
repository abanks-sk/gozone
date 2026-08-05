-- Demo seed for food_db — Kumasi.
-- Restaurant owner UUID matches auth_db seed.
--
-- Relocated from Accra. The shop list is filtered by distance now, so seeding vendors two
-- hundred kilometres from the person demoing the app meant an empty GoShop — the browse was
-- working perfectly and showing nothing. Real Kumasi businesses, at their real neighbourhoods.
--
-- The five ids are unchanged on purpose: the wallet seed, the GPS stream and scripts/e2e.sh all
-- reference them, and renaming a vendor should not mean rewriting four other files.

\c food_db;

INSERT INTO restaurants (id, owner_id, name, lat, lng, status, prep_minutes, vendor_type, address)
VALUES
  -- Adum — the commercial centre of Kumasi.
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'Papaye Fast Food', 6.6931, -1.6244, 'OPEN', 15, 'RESTAURANT', 'Adum, Kumasi'),
  -- Asokwa, by the Kumasi City Mall.
  ('bbbbbbbb-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'Chicken Republic', 6.6706, -1.6018, 'OPEN', 20, 'RESTAURANT', 'Kumasi City Mall, Asokwa'),
  -- Non-food vendors: same ordering/queue/delivery primitives, different goods.
  ('bbbbbbbb-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'Ernest Chemists', 6.7000, -1.6300, 'OPEN', 10, 'PHARMACY', 'Bantama High Street, Kumasi'),
  ('bbbbbbbb-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'Melcom Kumasi', 6.6950, -1.6210, 'OPEN', 25, 'GROCERY', 'Adum, Kumasi'),
  -- Deliberately ~18 km east, in Ejisu. The other four sit within a few kilometres of each other
  -- in central Kumasi, which makes a courier's progress almost invisible on the tracking map —
  -- you cannot tell a moving marker from a stuck one at that scale. Order from here to watch a
  -- delivery actually travel. It also exercises the distance-based delivery fee, which is
  -- otherwise always near its floor.
  ('bbbbbbbb-0000-0000-0000-000000000005',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'Ejisu Grill Spot', 6.7333, -1.4667, 'OPEN', 20, 'RESTAURANT', 'Ejisu, Ashanti Region')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      address = EXCLUDED.address,
      vendor_type = EXCLUDED.vendor_type;

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
  -- Ejisu (the far vendor, for watching a delivery actually cover ground)
  ('bbbbbbbb-0000-0000-0000-000000000005'::uuid, 'Grilled Guinea Fowl',     48.00),
  ('bbbbbbbb-0000-0000-0000-000000000005'::uuid, 'Goat Light Soup',         38.00),
  ('bbbbbbbb-0000-0000-0000-000000000005'::uuid, 'Yam Chips',               15.00),
  ('bbbbbbbb-0000-0000-0000-000000000005'::uuid, 'Sobolo (large)',           8.00)
) AS v(restaurant_id, name, price)
WHERE NOT EXISTS (
  SELECT 1 FROM menu_items m
  WHERE m.restaurant_id = v.restaurant_id AND m.name = v.name
);

-- ── Imagery ──────────────────────────────────────────────────────────────────
--
-- Stored on the rows rather than in the customer app's bundled metadata, because that metadata
-- is keyed by NAME and only ever held the two original Accra restaurants. Renaming the vendors
-- dropped every one of them onto the same generic "food" fallback — and a pharmacy showing a
-- photograph of jollof is worse than showing nothing.
--
-- Keeping it in the database also means the VENDOR app sees the pictures too: it renders
-- image_url and has no bundled catalogue to fall back on, so its menu board was imageless.
--
-- Only fills blanks (image_url IS NULL), so a photo a vendor uploaded themselves is never
-- overwritten by a re-run.

UPDATE restaurants SET image_url = v.url FROM (VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'https://loremflickr.com/640/480/fried,chicken,restaurant?lock=101'),
  ('bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'https://loremflickr.com/640/480/fried,chicken,meal?lock=102'),
  ('bbbbbbbb-0000-0000-0000-000000000003'::uuid, 'https://loremflickr.com/640/480/pharmacy,drugstore,counter?lock=103'),
  ('bbbbbbbb-0000-0000-0000-000000000004'::uuid, 'https://loremflickr.com/640/480/supermarket,groceries,aisle?lock=104'),
  ('bbbbbbbb-0000-0000-0000-000000000005'::uuid, 'https://loremflickr.com/640/480/barbecue,grill,meat?lock=105')
) AS v(id, url) WHERE restaurants.id = v.id AND restaurants.image_url IS NULL;

UPDATE menu_items SET image_url = v.url FROM (VALUES
  -- Restaurant
  ('Jollof Rice',             'https://loremflickr.com/640/480/jollof,rice?lock=201'),
  ('Waakye',                  'https://loremflickr.com/640/480/rice,beans?lock=202'),
  ('Kelewele',                'https://loremflickr.com/640/480/fried,plantain?lock=203'),
  ('Iced Sobolo',             'https://loremflickr.com/640/480/hibiscus,drink?lock=204'),
  ('Grilled Tilapia',         'https://loremflickr.com/640/480/grilled,fish?lock=205'),
  ('Banku + Okro',            'https://loremflickr.com/640/480/okra,soup?lock=206'),
  ('Fufu + Light Soup',       'https://loremflickr.com/640/480/african,soup?lock=207'),
  ('Malt Drink',              'https://loremflickr.com/640/480/malt,drink?lock=208'),
  ('Grilled Guinea Fowl',     'https://loremflickr.com/640/480/grilled,chicken?lock=209'),
  ('Goat Light Soup',         'https://loremflickr.com/640/480/goat,stew?lock=210'),
  ('Yam Chips',               'https://loremflickr.com/640/480/yam,fries?lock=211'),
  ('Sobolo (large)',          'https://loremflickr.com/640/480/hibiscus,juice?lock=212'),
  -- Pharmacy — medicine, not meals
  ('Paracetamol 500mg (10s)', 'https://loremflickr.com/640/480/paracetamol,tablets?lock=301'),
  ('Vitamin C 1000mg',        'https://loremflickr.com/640/480/vitamin,supplement?lock=302'),
  ('Hand Sanitizer 250ml',    'https://loremflickr.com/640/480/hand,sanitizer?lock=303'),
  ('Surgical Face Mask (5s)', 'https://loremflickr.com/640/480/face,mask,medical?lock=304'),
  -- Grocery
  ('Fresh Milk 1L',           'https://loremflickr.com/640/480/milk,bottle?lock=401'),
  ('Sliced Bread',            'https://loremflickr.com/640/480/sliced,bread?lock=402'),
  ('Eggs (crate of 30)',      'https://loremflickr.com/640/480/eggs,carton?lock=403'),
  ('Perfumed Rice 5kg',       'https://loremflickr.com/640/480/rice,sack?lock=404'),
  ('Cooking Oil 2L',          'https://loremflickr.com/640/480/cooking,oil,bottle?lock=405')
) AS v(name, url) WHERE menu_items.name = v.name AND menu_items.image_url IS NULL;
