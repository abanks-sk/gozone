-- Scheduled rides: a request can be booked for a future time.
-- NULL = ride now (the default).
ALTER TABLE ride_requests ADD COLUMN scheduled_at TIMESTAMPTZ;
CREATE INDEX idx_ride_requests_rider ON ride_requests(rider_id);
