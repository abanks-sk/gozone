-- The shopfront a customer actually reads before ordering.
--
-- A vendor could edit their personal profile and their internal business details, but the page
-- customers see — the name at the top of the menu, what the place actually is, the cover image —
-- had no editor anywhere, and no columns to edit. Every storefront was whatever the seed said,
-- with imagery hardcoded in the customer app's local `shopCatalog` metadata. A real vendor
-- signing up got stock food photos regardless of what they sell.
--
-- `address` is the human-readable location line. It sits alongside lat/lng rather than replacing
-- them: coordinates route a courier, an address tells a customer which side of the street.
--
-- All nullable. Existing vendors keep behaving exactly as they do now — the customer app falls
-- back to its bundled metadata whenever these are empty, so nothing regresses for the seed data.
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS image_url   TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS address     TEXT;
