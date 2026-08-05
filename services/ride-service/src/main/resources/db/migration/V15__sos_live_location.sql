-- Keep an SOS alert's location current instead of frozen at the moment it was raised.
--
-- `lat`/`lng` were written once and never touched again, so a safety team watching the board saw
-- where the person was when they pressed the button — which, in a moving car, is the one place
-- they are certainly no longer. The reporter's app now refreshes it while the alert is open, and
-- `location_at` says how fresh it is: a stale position presented as live is worse than an old one
-- labelled as old.
ALTER TABLE sos_incidents ADD COLUMN IF NOT EXISTS location_at TIMESTAMPTZ;
