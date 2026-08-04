-- The passenger's side of boarding.
--
-- Confirming a pickup closes somebody's exit and puts a fare on them, and until now the driver
-- asserted it, the driver retracted it, and the passenger was told neither. A person wrongly marked
-- as being in a car had no way to say otherwise inside the system.
--
-- A dispute deliberately does NOT change the boarding flag. Letting it would re-open the free-ride
-- hole from the other side: ride the whole way, dispute at the end, leave without paying. What it
-- does instead is put the objection on the record, tell the driver — who can then undo it, and is
-- allowed to do so at any time once a dispute is open, not just inside the usual short window —
-- and make it visible to an admin if the driver disagrees.
ALTER TABLE trip_passengers ADD COLUMN pickup_disputed_at  TIMESTAMPTZ;
ALTER TABLE trip_passengers ADD COLUMN pickup_dispute_note TEXT;
