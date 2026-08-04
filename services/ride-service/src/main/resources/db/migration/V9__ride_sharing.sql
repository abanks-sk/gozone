-- Ride sharing (pooling).
--
-- A passenger opts in when they request the ride; a shared trip already on the road can then pick
-- up a second passenger whose route lies along the same corridor, and everybody's fare drops as
-- the car fills.
--
-- The load-bearing change is that a fare stops being a property of the TRIP and becomes a property
-- of the PASSENGER. A shared trip has two people paying two different amounts, each of whom must
-- be able to pay it, and be chased for it, independently.

ALTER TABLE ride_requests ADD COLUMN shared BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE trips         ADD COLUMN shared BOOLEAN NOT NULL DEFAULT FALSE;

-- A joining rider's request never gets a trip row of its own — the trip belongs to whoever booked
-- it. Without this link a joiner polling their own request would see it sitting at MATCHED with no
-- ride attached, which is the state the tracking screen reads as "still looking for a driver".
ALTER TABLE trip_passengers ADD COLUMN request_id UUID REFERENCES ride_requests(id);

-- What this passenger would have paid alone. locked_fare is recomputed from solo_fare every time
-- somebody joins, so a discount is always applied to the original number — applying it to the
-- already-discounted one would compound, and the third passenger would ride nearly free.
ALTER TABLE trip_passengers ADD COLUMN solo_fare NUMERIC(10, 2);

-- Payment is per passenger for the same reason the fare is.
ALTER TABLE trip_passengers ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID';
ALTER TABLE trip_passengers ADD COLUMN payment_method VARCHAR(20);
ALTER TABLE trip_passengers ADD COLUMN joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Existing trips are single-passenger, so the passenger row is the trip: carry the trip's request,
-- fare and payment state across. Skipping this would declare every historic paid trip unpaid the
-- moment the roll-up starts reading passenger rows.
UPDATE trip_passengers tp
SET request_id     = COALESCE(tp.request_id, t.request_id),
    solo_fare      = COALESCE(tp.solo_fare, tp.locked_fare),
    payment_status = t.payment_status,
    payment_method = t.payment_method
FROM trips t
WHERE t.id = tp.trip_id;

ALTER TABLE trip_passengers ALTER COLUMN solo_fare SET NOT NULL;

CREATE INDEX idx_trip_passengers_request ON trip_passengers(request_id);
CREATE INDEX idx_trip_passengers_rider   ON trip_passengers(rider_id);

-- Only shared requests are ever scanned for a pooling match, and they are a minority of rows.
CREATE INDEX idx_ride_requests_shared ON ride_requests(status) WHERE shared;
