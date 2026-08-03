-- Pictures a vendor can actually put there.
--
-- `restaurants.image_url` already existed (V12) but the app only offered a text box asking for a
-- link — "what type of link does it use and why doesn't it just let you choose a photo". A vendor
-- has a photo on their phone, not a URL. The column stays; what changes is that it now holds a
-- path to something they uploaded through the app.
--
-- Two things were missing entirely: a logo (the mark on the shop card is separate from the wide
-- banner across the menu page) and a picture per dish, which is why every item still falls back to
-- a bundled stock photo of somebody else's food.

ALTER TABLE restaurants ADD COLUMN logo_url TEXT;
COMMENT ON COLUMN restaurants.logo_url IS
    'Square shop mark. image_url is the wide banner across the top of the menu — different shapes, '
    'different jobs, so a vendor sets them separately.';

ALTER TABLE menu_items ADD COLUMN image_url TEXT;
COMMENT ON COLUMN menu_items.image_url IS
    'Photo of this dish or product. Null falls back to the customer app''s bundled imagery, so the '
    'seeded menus look exactly as they did.';
