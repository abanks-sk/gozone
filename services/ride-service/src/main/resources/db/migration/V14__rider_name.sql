-- The passenger's name on the request, so a driver or courier knows who they are looking for.
--
-- `rider_phone` has been here since V7, but a number alone does not let a courier hand a parcel
-- to the right person at a door, and the driver's passenger card had nothing to put in it. Names
-- live in auth_db and no service reads another service's database, so this is stamped at booking
-- from an internal lookup — the same approach food-service uses for orders.
ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS rider_name VARCHAR(120);
