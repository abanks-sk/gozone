-- Customer's phone on the request so the matched driver can call them
-- (revealed only via TripResponse, i.e. after a trip exists — not in the feed).
ALTER TABLE ride_requests ADD COLUMN rider_phone TEXT;
