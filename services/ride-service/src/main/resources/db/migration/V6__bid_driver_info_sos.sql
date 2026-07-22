-- Accept-as-offer flow: a driver's bid now carries their identity + vehicle +
-- position so the rider can compare offers (distance, car) before choosing.
ALTER TABLE bids ADD COLUMN driver_name  TEXT;
ALTER TABLE bids ADD COLUMN driver_phone TEXT;
ALTER TABLE bids ADD COLUMN vehicle      TEXT;
ALTER TABLE bids ADD COLUMN plate        TEXT;
ALTER TABLE bids ADD COLUMN driver_lat   DOUBLE PRECISION;
ALTER TABLE bids ADD COLUMN driver_lng   DOUBLE PRECISION;

-- SOS incidents: rider taps SOS → recorded here → admin web triages.
CREATE TABLE sos_incidents (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    UUID,
    user_id    UUID NOT NULL,
    lat        DOUBLE PRECISION,
    lng        DOUBLE PRECISION,
    status     VARCHAR(20) NOT NULL DEFAULT 'NEW'
                   CHECK (status IN ('NEW','HANDLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sos_status ON sos_incidents(status, created_at DESC);
