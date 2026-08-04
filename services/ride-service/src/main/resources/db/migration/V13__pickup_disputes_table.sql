-- Move pickup disputes off trip_passengers and into their own table.
--
-- They were columns on the passenger row, which meant leaving a shared ride destroyed the record:
-- leavePool deletes the seat, and the objection, the note and whoever was found to be right went
-- with it. An argument about money should outlive the seat it was about — a driver who repeatedly
-- marks people aboard who are not in the car is a pattern nobody could see if every complainant
-- who walked away erased their own complaint.
--
-- Keyed on (trip, rider) rather than referencing trip_passengers, so nothing cascades. The fare and
-- boarding order are copied in because they are the substance of the claim and would otherwise be
-- unreadable once the seat is gone.
CREATE TABLE pickup_disputes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id      UUID        NOT NULL REFERENCES trips(id),
    rider_id     UUID        NOT NULL,
    pickup_seq   SMALLINT    NOT NULL DEFAULT 1,
    locked_fare  NUMERIC(10, 2),
    raised_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note         TEXT,
    resolved_at  TIMESTAMPTZ,
    outcome      TEXT
);

-- One live dispute per person per trip. A partial unique index rather than a service check, for the
-- same reason the driver edit-requests use one: two requests arriving together should be stopped by
-- the database, not by a read-then-write that can interleave.
CREATE UNIQUE INDEX idx_pickup_disputes_open
    ON pickup_disputes (trip_id, rider_id)
    WHERE resolved_at IS NULL;

CREATE INDEX idx_pickup_disputes_raised ON pickup_disputes (raised_at DESC);

-- Carry across everything raised while this lived on the passenger row.
INSERT INTO pickup_disputes (trip_id, rider_id, pickup_seq, locked_fare, raised_at, note, resolved_at, outcome)
SELECT tp.trip_id, tp.rider_id, tp.pickup_seq, tp.locked_fare,
       tp.pickup_disputed_at, tp.pickup_dispute_note,
       tp.pickup_dispute_resolved_at, tp.pickup_dispute_outcome
FROM trip_passengers tp
WHERE tp.pickup_disputed_at IS NOT NULL;

ALTER TABLE trip_passengers DROP COLUMN pickup_disputed_at;
ALTER TABLE trip_passengers DROP COLUMN pickup_dispute_note;
ALTER TABLE trip_passengers DROP COLUMN pickup_dispute_resolved_at;
ALTER TABLE trip_passengers DROP COLUMN pickup_dispute_outcome;
