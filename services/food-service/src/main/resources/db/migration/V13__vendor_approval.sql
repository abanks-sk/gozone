-- A business is approved separately from the person who owns it.
--
-- Until now the two were the same event: a vendor signed up, filled in their first business, and an
-- admin approved their *account* — which is really a check on the person. The business itself was
-- never reviewed, its name never even reached the admin screen, and a vendor who later added a
-- second one would have had it go live unexamined.
--
-- `status` on this table is already taken: it is the trading state a vendor toggles themselves
-- (OPEN / CLOSED / PAUSED). Approval is somebody else's decision about them, so it gets its own
-- column rather than more values in that one.

ALTER TABLE restaurants ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
ALTER TABLE restaurants ADD CONSTRAINT restaurants_approval_check
    CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED'));

/** Why a business was refused — the owner is shown it, so it has to say what to change. */
ALTER TABLE restaurants ADD COLUMN approval_note VARCHAR(500);
ALTER TABLE restaurants ADD COLUMN approved_by UUID;
ALTER TABLE restaurants ADD COLUMN approved_at TIMESTAMPTZ;

-- Everything that already exists is trading and visible to customers today. Defaulting them to
-- PENDING would empty the customer's shop list and strand the demo behind an approval queue, so
-- they are grandfathered in: this reviews what comes next, it does not re-open what is settled.
UPDATE restaurants SET approval_status = 'APPROVED', approved_at = created_at;

CREATE INDEX idx_restaurants_approval ON restaurants (approval_status);
