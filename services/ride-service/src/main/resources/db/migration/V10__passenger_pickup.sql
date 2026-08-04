-- Per-passenger boarding.
--
-- Leaving a shared ride was allowed right up until the trip completed, because nothing could tell
-- a passenger waiting at the kerb from one already sitting in the car — so somebody could ride the
-- whole way and then leave without paying. This is the missing fact.
--
-- For the passenger who booked, boarding is what STARTED already means, and the service stamps
-- them at that transition. A joiner gets in at their own kerb, minutes later, with the trip already
-- STARTED — which is exactly why a trip-level status cannot answer this and a column here can.
ALTER TABLE trip_passengers ADD COLUMN picked_up_at TIMESTAMPTZ;

-- Anyone on a trip that has started or finished is aboard, whatever else is true. Backfilling only
-- ever *blocks* leaving, which is the safe direction to be wrong in: the alternative would let
-- somebody walk away from a ride they have already taken.
UPDATE trip_passengers tp
SET picked_up_at = COALESCE(t.started_at, t.completed_at)
FROM trips t
WHERE t.id = tp.trip_id
  AND t.status IN ('STARTED', 'COMPLETED')
  AND tp.picked_up_at IS NULL;
