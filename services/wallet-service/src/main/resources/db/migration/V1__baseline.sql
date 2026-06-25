-- GoZone Wallet + Notification Service — initial schema

CREATE TABLE wallets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   UUID          NOT NULL,
    owner_type VARCHAR(20)   NOT NULL
                   CHECK (owner_type IN ('DRIVER','RESTAURANT','CUSTOMER','COURIER')),
    balance    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    UNIQUE (owner_id, owner_type)
);

CREATE TABLE ledger_entries (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id  UUID          NOT NULL REFERENCES wallets(id),
    amount     NUMERIC(12,2) NOT NULL,
    type       VARCHAR(20)   NOT NULL
                   CHECK (type IN ('CREDIT','DEBIT','COMMISSION','PAYOUT')),
    ref_type   VARCHAR(10)   CHECK (ref_type IN ('TRIP','ORDER')),
    ref_id     UUID,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Commission rates seeded here; admin can update via DB or a future config endpoint.
CREATE TABLE commission_config (
    id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pillar VARCHAR(10) NOT NULL UNIQUE CHECK (pillar IN ('RIDE','FOOD')),
    rate   NUMERIC(5,4) NOT NULL   -- 0.18 = 18%, 0.12 = 12%
);

INSERT INTO commission_config (pillar, rate) VALUES ('RIDE', 0.18), ('FOOD', 0.12);

-- Push tokens registered by the mobile app.
CREATE TABLE push_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL,
    token      VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL,
    event      VARCHAR(50)  NOT NULL,
    channel    VARCHAR(10)  NOT NULL CHECK (channel IN ('PUSH','SMS')),
    status     VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','SENT','FAILED')),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_wallet  ON ledger_entries(wallet_id);
CREATE INDEX idx_ledger_ref     ON ledger_entries(ref_type, ref_id);
CREATE INDEX idx_push_user      ON push_tokens(user_id);
CREATE INDEX idx_notif_user     ON notifications(user_id);
