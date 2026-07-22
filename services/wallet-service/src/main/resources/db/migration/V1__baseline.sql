-- GoZone Wallet + Notification Service — initial schema
-- Columns and types are kept in sync with the JPA entities (ddl-auto: validate).

CREATE TABLE wallets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   UUID          NOT NULL,
    owner_type VARCHAR(30)   NOT NULL,   -- RIDER | DRIVER | RESTAURANT | PLATFORM | COURIER
    balance    NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, owner_type)
);

CREATE TABLE ledger_entries (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id  UUID          NOT NULL REFERENCES wallets(id),
    amount     NUMERIC(14,2) NOT NULL,   -- positive = credit, negative = debit
    type       VARCHAR(30)   NOT NULL,   -- FARE_CREDIT | COMMISSION_DEBIT | PAYOUT | TOP_UP | REFUND
    ref_id     UUID,                     -- tripId or orderId
    ref_type   VARCHAR(20),              -- TRIP | ORDER
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Commission rates. pillar is the primary key (matches CommissionConfig entity).
CREATE TABLE commission_config (
    pillar VARCHAR(20)  PRIMARY KEY,     -- RIDE | FOOD
    rate   NUMERIC(5,4) NOT NULL         -- 0.18 = 18%, 0.12 = 12%
);

INSERT INTO commission_config (pillar, rate) VALUES ('RIDE', 0.18), ('FOOD', 0.12);

-- Expo push tokens registered by the mobile app.
CREATE TABLE push_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL,
    token      VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID          NOT NULL,
    title      VARCHAR(200)  NOT NULL,
    body       VARCHAR(1000) NOT NULL,
    channel    VARCHAR(20)   NOT NULL,   -- PUSH | SMS_STUB
    sent       BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_wallet  ON ledger_entries(wallet_id);
CREATE INDEX idx_ledger_ref     ON ledger_entries(ref_type, ref_id);
CREATE INDEX idx_push_user      ON push_tokens(user_id);
CREATE INDEX idx_notif_user     ON notifications(user_id);
