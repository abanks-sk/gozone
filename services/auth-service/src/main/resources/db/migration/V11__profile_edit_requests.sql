-- Asking to change something that was verified.
--
-- A driver's name, vehicle and documents are locked once an admin approves the account: they are
-- what the admin checked, and someone who could rewrite their own plate or swap their licence photo
-- afterwards could put a different vehicle — or a different person — on the road under an identity
-- that had been verified. Until now "locked" meant a dead end, and both screens told the driver to
-- contact support, which is a request nobody could act on inside the system.
--
-- A request holds only the fields being changed; everything else stays null and is left alone when
-- it is applied. Nothing takes effect until an admin approves it.

CREATE TABLE profile_edit_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    -- Proposed values. NULL means "not part of this request", which is why nothing here is NOT NULL.
    name            VARCHAR(100),
    vehicle_make    VARCHAR(40),
    vehicle_model   VARCHAR(40),
    vehicle_colour  VARCHAR(30),
    vehicle_plate   VARCHAR(20),
    licence_no      VARCHAR(60),
    id_selfie_url   TEXT,
    licence_url     TEXT,
    vehicle_photo_url TEXT,
    roadworthy_url  TEXT,

    /** Why the driver says it changed — an admin approving a new plate deserves the reason. */
    reason          VARCHAR(500),
    /** Why the admin decided as they did. Required on a rejection; the driver is shown it. */
    review_note     VARCHAR(500),
    reviewed_by     UUID,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT profile_edit_requests_status_check
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX idx_edit_requests_user   ON profile_edit_requests (user_id, created_at DESC);
CREATE INDEX idx_edit_requests_status ON profile_edit_requests (status, created_at DESC);

-- One open request per driver. Without this a driver could queue several conflicting changes and
-- an admin approving them in any order would get a result nobody asked for.
CREATE UNIQUE INDEX idx_edit_requests_one_open
    ON profile_edit_requests (user_id) WHERE status = 'PENDING';
