-- Promotions become functional rather than decorative.
--
-- Two families of promo:
--   DISCOUNT — the platform computes the reduction at checkout (this file's
--              discount_type/discount_value), applied to whatever the promo is
--              scoped to.
--   BOGO / OTHER — the vendor fulfils it (e.g. "buy one get one free"). The
--              platform only records and displays it so the customer and the
--              vendor both see the same terms on the order. No money logic.
--
-- Scope decides both what a discount applies to and where the card links:
--   VENDOR   → the vendor's whole menu/catalogue
--   CATEGORY → one category within that vendor (menu_items.category)
--   ITEM     → one specific dish/product (menu_item_id)

-- Categories let a promo target part of a catalogue, and let the customer app
-- group a menu from real data instead of frontend-only metadata.
ALTER TABLE menu_items ADD COLUMN category VARCHAR(40);

ALTER TABLE promos ADD COLUMN promo_kind     VARCHAR(20)    NOT NULL DEFAULT 'DISCOUNT';
ALTER TABLE promos ADD COLUMN discount_type  VARCHAR(10);
ALTER TABLE promos ADD COLUMN discount_value NUMERIC(10,2);
ALTER TABLE promos ADD COLUMN scope          VARCHAR(20)    NOT NULL DEFAULT 'VENDOR';
ALTER TABLE promos ADD COLUMN menu_item_id   UUID;
ALTER TABLE promos ADD COLUMN image_url      TEXT;
ALTER TABLE promos ADD COLUMN description    TEXT;

-- Reclassify BEFORE the constraints go on: the seeded cards predate this and are
-- decorative announcements, not money. The column default is DISCOUNT, so they
-- would otherwise violate the terms constraint the moment it is added.
UPDATE promos SET promo_kind = 'OTHER' WHERE discount_value IS NULL;

ALTER TABLE promos ADD CONSTRAINT promos_kind_chk
  CHECK (promo_kind IN ('DISCOUNT','BOGO','OTHER'));
ALTER TABLE promos ADD CONSTRAINT promos_scope_chk
  CHECK (scope IN ('VENDOR','CATEGORY','ITEM'));
ALTER TABLE promos ADD CONSTRAINT promos_discount_type_chk
  CHECK (discount_type IS NULL OR discount_type IN ('PERCENT','AMOUNT'));
-- A discount promo must carry usable terms.
ALTER TABLE promos ADD CONSTRAINT promos_discount_terms_chk
  CHECK (promo_kind <> 'DISCOUNT'
         OR (discount_type IS NOT NULL AND discount_value IS NOT NULL AND discount_value > 0));

-- What a placed order actually received. Labels are snapshots so an order's
-- history survives the promo being edited, deactivated or deleted later.
ALTER TABLE orders ADD COLUMN discount    NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN promo_id    UUID;
ALTER TABLE orders ADD COLUMN promo_label TEXT;
ALTER TABLE orders ADD COLUMN promo_notes TEXT;

CREATE INDEX idx_promos_vendor_active ON promos(vendor_id, active);
CREATE INDEX idx_menu_items_category   ON menu_items(restaurant_id, category);
