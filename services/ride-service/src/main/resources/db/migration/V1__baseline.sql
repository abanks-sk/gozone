-- GoZone Ride Service — initial schema (PostGIS required on ride_db)

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE ride_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id      UUID              NOT NULL,
    origin        GEOGRAPHY(POINT, 4326) NOT NULL,
    dest          GEOGRAPHY(POINT, 4326) NOT NULL,
    seats         SMALLINT          NOT NULL DEFAULT 1 CHECK (seats >= 1),
    proposed_fare NUMERIC(10, 2)    NOT NULL CHECK (proposed_fare > 0),
    status        VARCHAR(20)       NOT NULL DEFAULT 'OPEN'
                      CHECK (status IN ('OPEN','MATCHED','CANCELLED')),
    created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE TABLE bids (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  UUID            NOT NULL REFERENCES ride_requests(id),
    driver_id   UUID            NOT NULL,
    amount      NUMERIC(10, 2)  NOT NULL CHECK (amount > 0),
    type        VARCHAR(10)     NOT NULL CHECK (type IN ('ACCEPT','COUNTER')),
    status      VARCHAR(20)     NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','ACCEPTED','REJECTED','WITHDRAWN')),
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE trips (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id   UUID            NOT NULL REFERENCES ride_requests(id),
    driver_id    UUID            NOT NULL,
    agreed_fare  NUMERIC(10, 2)  NOT NULL,
    status       VARCHAR(20)     NOT NULL DEFAULT 'MATCHED'
                     CHECK (status IN ('MATCHED','ENROUTE','STARTED','COMPLETED','CANCELLED')),
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- One row per rider on a shared trip. locked_fare is never recomputed after join.
CREATE TABLE trip_passengers (
    trip_id         UUID           NOT NULL REFERENCES trips(id),
    rider_id        UUID           NOT NULL,
    locked_fare     NUMERIC(10, 2) NOT NULL,
    join_distance_km NUMERIC(8, 3),
    pickup_seq      SMALLINT       NOT NULL DEFAULT 1,
    rule_version    VARCHAR(20)    NOT NULL DEFAULT 'v1',
    PRIMARY KEY (trip_id, rider_id)
);

-- Last-known driver location; upserted on each GPS ping.
CREATE TABLE driver_locations (
    driver_id  UUID                    PRIMARY KEY,
    point      GEOGRAPHY(POINT, 4326)  NOT NULL,
    updated_at TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE TABLE ride_ratings (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    UUID     NOT NULL REFERENCES trips(id),
    rater_id   UUID     NOT NULL,
    ratee_id   UUID     NOT NULL,
    score      SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (trip_id, rater_id, ratee_id)
);

CREATE INDEX idx_requests_status ON ride_requests(status);
CREATE INDEX idx_requests_origin ON ride_requests USING GIST(origin);
CREATE INDEX idx_requests_dest   ON ride_requests USING GIST(dest);
CREATE INDEX idx_locations_point ON driver_locations USING GIST(point);
CREATE INDEX idx_bids_request    ON bids(request_id);
CREATE INDEX idx_trips_driver    ON trips(driver_id, status);
