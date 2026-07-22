-- Customer payment for a trip. UNPAID → (rider pays) → PAID for wallet/card/momo,
-- or AWAITING for cash until the driver confirms cash received → PAID.
ALTER TABLE trips ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID','AWAITING','PAID'));
ALTER TABLE trips ADD COLUMN payment_method VARCHAR(20);
