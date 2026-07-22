-- Requests now carry their kind + class routing info so drivers only see what fits
-- their vehicle class and service mode.
--   kind:        RIDE | PARCEL
--   ride_type:   STANDARD | LUXE | OKADA  (for rides)
--   parcel_size: SMALL | MEDIUM | LARGE   (for parcels)
--   parcel_desc: free text — what the parcel is (required on the client)
ALTER TABLE ride_requests ADD COLUMN kind        VARCHAR(20) NOT NULL DEFAULT 'RIDE';
ALTER TABLE ride_requests ADD COLUMN ride_type   VARCHAR(20) NOT NULL DEFAULT 'STANDARD';
ALTER TABLE ride_requests ADD COLUMN parcel_size VARCHAR(20);
ALTER TABLE ride_requests ADD COLUMN parcel_desc TEXT;
