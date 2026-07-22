-- Admin-controlled platform fees. Vendors set their own food prices; GoZone adds a
-- service fee (percentage of the food subtotal) and a distance-based delivery fee.
-- These are platform-level (not per-vendor) and edited by admins.

CREATE TABLE platform_settings (
    id                SMALLINT       PRIMARY KEY,
    service_fee_pct   NUMERIC(6,4)   NOT NULL DEFAULT 0.0500,  -- 5% of subtotal
    delivery_base_fee NUMERIC(10,2)  NOT NULL DEFAULT 2.00,
    delivery_per_km   NUMERIC(10,2)  NOT NULL DEFAULT 1.50
);

INSERT INTO platform_settings (id, service_fee_pct, delivery_base_fee, delivery_per_km)
VALUES (1, 0.0500, 2.00, 1.50);

ALTER TABLE orders ADD COLUMN service_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
