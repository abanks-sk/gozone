-- Driver vehicle class + service mode for request routing.
--   vehicle_class: OKADA (bike) | STANDARD | LUXE (cars) | CARGO (truck/pickup).
--     Okada/Cargo are set at sign-up; a car is NULL until an admin assigns Standard/Luxe.
--   service_mode: RIDES | DELIVERIES | BOTH (driver-controlled; default BOTH).
ALTER TABLE users ADD COLUMN vehicle_class VARCHAR(20);
ALTER TABLE users ADD COLUMN service_mode  VARCHAR(20) NOT NULL DEFAULT 'BOTH';

-- Seeded drivers get a sensible default so they can operate immediately.
UPDATE users SET vehicle_class = 'STANDARD' WHERE role = 'DRIVER' AND vehicle_class IS NULL;
UPDATE users SET vehicle_class = 'OKADA'    WHERE role = 'COURIER' AND vehicle_class IS NULL;
