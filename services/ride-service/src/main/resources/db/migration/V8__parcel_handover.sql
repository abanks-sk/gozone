-- Parcel handover details.
--
-- The apps already collected these and then dropped them on the floor: the courier could see
-- a parcel's size and description but had no idea who to hand it to, or which number to ring
-- at the door. A parcel needs a second person, which a ride does not.
--
-- direction says which end of the trip the customer is standing at:
--   SEND    — the customer is the sender, at the pickup; the other party receives at the drop-off
--   RECEIVE — the customer is the recipient, at the drop-off; the other party hands over at pickup
-- so with direction + party_* + ride_requests.rider_phone, the courier knows who to meet at
-- both ends. "party" rather than "recipient" because on a RECEIVE that person is the sender.

ALTER TABLE ride_requests
    ADD COLUMN direction  VARCHAR(20),   -- SEND | RECEIVE (null for rides)
    ADD COLUMN party_name  VARCHAR(120),
    ADD COLUMN party_phone VARCHAR(30);
