-- The vehicle a driver actually drives.
--
-- Sign-up asked which *kind* of vehicle it was (okada / car / truck, which becomes vehicle_class)
-- and nothing else. The make, model, colour and plate lived in a zustand store on the phone,
-- persisted to local storage and sent to nobody: the vehicle description a passenger sees attached
-- to a bid came from that store, so it was whatever the driver had typed and had never been seen by
-- anyone. It also vanished on reinstall, and the admin grading a car Standard or Luxe was doing it
-- without knowing what the car was.

ALTER TABLE users ADD COLUMN vehicle_make   VARCHAR(40);
ALTER TABLE users ADD COLUMN vehicle_model  VARCHAR(40);
ALTER TABLE users ADD COLUMN vehicle_colour VARCHAR(30);
ALTER TABLE users ADD COLUMN vehicle_plate  VARCHAR(20);

COMMENT ON COLUMN users.vehicle_plate IS
    'Registration plate as given at sign-up. driver_kyc.vehicle_reg is the copy submitted for a '
    'particular review; this is the current vehicle on the account.';

-- Seeded drivers get plausible vehicles so the demo and the admin grading screen have something to
-- show. Matched on the vehicle class they already carry rather than on id, so re-running is safe.
UPDATE users SET vehicle_make = 'Toyota', vehicle_model = 'Vitz', vehicle_colour = 'Silver',
                 vehicle_plate = 'GR-' || substr(replace(id::text, '-', ''), 1, 4) || '-24'
 WHERE role IN ('DRIVER', 'COURIER') AND vehicle_class IN ('STANDARD', 'LUXE') AND vehicle_plate IS NULL;

UPDATE users SET vehicle_make = 'Haojue', vehicle_model = 'DK150', vehicle_colour = 'Red',
                 vehicle_plate = 'M-' || substr(replace(id::text, '-', ''), 1, 4) || '-24'
 WHERE role IN ('DRIVER', 'COURIER') AND vehicle_class = 'OKADA' AND vehicle_plate IS NULL;
