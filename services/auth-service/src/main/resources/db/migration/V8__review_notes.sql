-- Say why.
--
-- Rejecting a driver or a vendor set a status and nothing else. The applicant's app told them they
-- had been turned down and could not tell them what to fix, so the only way forward was to contact
-- support and ask a human to look up a decision that had already been made and recorded. The
-- reviewer knew the reason at the moment they clicked; there was simply nowhere to put it.

ALTER TABLE users ADD COLUMN status_note VARCHAR(500);
COMMENT ON COLUMN users.status_note IS
    'Why the account is in this status — written by the reviewing admin, shown to the applicant.';

ALTER TABLE driver_kyc ADD COLUMN review_note VARCHAR(500);
COMMENT ON COLUMN driver_kyc.review_note IS
    'Why the documents were accepted or refused — written by the reviewing admin, shown to the driver.';

-- Who decided, so a disputed rejection can be traced to a person rather than to "an admin".
ALTER TABLE users ADD COLUMN status_reviewed_by UUID;
ALTER TABLE users ADD COLUMN status_reviewed_at TIMESTAMPTZ;
