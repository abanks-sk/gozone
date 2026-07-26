-- Cash out: a driver/vendor moves earned wallet money to mobile money or a bank account.
-- Columns are kept in sync with the Withdrawal entity (ddl-auto: validate).
--
-- The wallet is debited the moment a withdrawal is requested (the money is held), so a
-- balance can never be spent twice while a payout is in flight. A FAILED payout refunds it.

CREATE TABLE withdrawals (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id       UUID          NOT NULL,          -- the user requesting (driver/vendor)
    owner_type     VARCHAR(30)   NOT NULL,          -- DRIVER | RESTAURANT
    amount         NUMERIC(14,2) NOT NULL,
    method         VARCHAR(20)   NOT NULL,          -- MOMO | BANK
    account_name   VARCHAR(120)  NOT NULL,
    account_number VARCHAR(40)   NOT NULL,          -- momo number or bank account number
    provider       VARCHAR(40)   NOT NULL,          -- MTN/VODAFONE/AIRTELTIGO, or the bank
    status         VARCHAR(20)   NOT NULL,          -- PENDING | PROCESSING | PAID | FAILED
    provider_ref   VARCHAR(120),                    -- Paystack transfer code / reference
    failure_reason VARCHAR(255),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    completed_at   TIMESTAMPTZ
);

CREATE INDEX idx_withdrawal_owner  ON withdrawals(owner_id, owner_type);
CREATE INDEX idx_withdrawal_status ON withdrawals(status);
