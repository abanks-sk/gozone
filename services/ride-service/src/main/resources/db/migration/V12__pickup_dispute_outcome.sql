-- How a pickup dispute ended.
--
-- Until now resolving one cleared `pickup_disputed_at`, which meant a settled dispute left no trace
-- of ever having happened — the objection, and whoever was found to be right, both vanished. For an
-- argument about money that is the wrong thing to forget.
--
-- So the objection stays put and the resolution is recorded beside it. "Open" becomes
-- disputed_at IS NOT NULL AND resolved_at IS NULL, which is also what the admin board lists.
ALTER TABLE trip_passengers ADD COLUMN pickup_dispute_resolved_at TIMESTAMPTZ;
ALTER TABLE trip_passengers ADD COLUMN pickup_dispute_outcome     TEXT;

-- Anything disputed before this migration was cleared on resolution rather than recorded, so a row
-- still carrying a disputed_at is by definition one nobody has answered yet. Leaving them open is
-- correct: they are exactly the cases an admin has not seen.
CREATE INDEX idx_trip_passengers_open_dispute
    ON trip_passengers (pickup_disputed_at)
    WHERE pickup_disputed_at IS NOT NULL AND pickup_dispute_resolved_at IS NULL;
