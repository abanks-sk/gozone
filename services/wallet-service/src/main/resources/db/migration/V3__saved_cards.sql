-- Reusable card authorizations returned by Paystack.
--
-- The app used to collect a card number into a local store and call it a saved card. It was
-- never used for anything: Paystack's hosted checkout collects the details itself, so the
-- customer typed their number into our form and then typed it again on Paystack's page.
--
-- Paystack's actual mechanism is an authorization code, handed back after a successful charge
-- and chargeable server-side afterwards. That is what this table holds. Note what it does NOT
-- hold: no PAN, no CVV, no expiry we could transact with — only the code, plus the last four
-- digits and brand so a human can tell their cards apart. We could not leak a usable card here
-- if we tried, which is exactly why this is the right way round.
--
-- Cards only. Paystack does not issue reusable authorizations for mobile money, so momo goes
-- through checkout every time and is deliberately not stored.
CREATE TABLE IF NOT EXISTS payment_authorizations (
    id                 UUID PRIMARY KEY,
    user_id            UUID        NOT NULL,
    authorization_code TEXT        NOT NULL,
    -- Paystack's own fingerprint for the card. Same card re-used on a later payment comes back
    -- with the same signature, so this is what stops one card appearing three times in the list.
    signature          TEXT,
    last4              VARCHAR(4),
    brand              VARCHAR(32),
    bank               VARCHAR(120),
    exp_month          VARCHAR(2),
    exp_year           VARCHAR(4),
    -- The email the authorization was created against; charging it later must reuse the same one.
    email              VARCHAR(160) NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_auth_user ON payment_authorizations(user_id);

-- One row per card per user. Partial, because Paystack can omit a signature.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_auth_user_sig
    ON payment_authorizations(user_id, signature) WHERE signature IS NOT NULL;
