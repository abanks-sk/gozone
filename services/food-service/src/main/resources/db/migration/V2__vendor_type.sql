-- Generalize "restaurants" into multi-type vendors (food, pharmacy, grocery, …).
-- Additive: the table/columns keep their names; we just classify each vendor.
-- Existing rows default to RESTAURANT so nothing breaks.
ALTER TABLE restaurants
    ADD COLUMN vendor_type VARCHAR(20) NOT NULL DEFAULT 'RESTAURANT'
        CHECK (vendor_type IN ('RESTAURANT','PHARMACY','GROCERY','CONVENIENCE','OTHER'));

CREATE INDEX idx_restaurants_vendor_type ON restaurants(vendor_type);
