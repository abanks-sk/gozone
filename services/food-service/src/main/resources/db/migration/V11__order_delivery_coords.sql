-- Where a delivery order is actually going.
--
-- The checkout has always sent delivery_lat/delivery_lng, but placeOrder used them once to work
-- out the distance-based delivery fee and then dropped them on the floor. Nothing kept them, so
-- after checkout the platform knew the customer's address only as free text.
--
-- That is why the customer's order screen could not draw a map: there was no destination to draw.
-- It is also why a courier gets a street name rather than a pin. Same shape of bug as the parcel
-- handover details — collected, relied upon, then discarded.
--
-- NULL for every existing order and for pickup/walk-in, which have no delivery leg. The map falls
-- back to showing the vendor and the courier only, rather than inventing a destination.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(10, 7);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(10, 7);
