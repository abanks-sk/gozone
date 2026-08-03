-- Give the seeded drivers distinct plates.
--
-- V9 built demo plates from the *first* four hex characters of the user id, and the seeded accounts
-- are deliberately readable UUIDs — aaaaaaaa-0000-…-0002 and aaaaaaaa-0000-…-0003 — so two drivers
-- came out holding "GR-aaaa-24". A duplicate registration is exactly the sort of thing an admin is
-- meant to catch, so demo data must not look like one.
--
-- V9 is already applied elsewhere and its checksum is recorded, so this corrects rather than edits.
-- The last four characters are what actually differ between the seeded ids.

UPDATE users
   SET vehicle_plate = CASE WHEN vehicle_class = 'OKADA' THEN 'M-' ELSE 'GR-' END
                     || upper(right(replace(id::text, '-', ''), 4)) || '-24'
 WHERE role IN ('DRIVER', 'COURIER')
   AND vehicle_plate IS NOT NULL;
