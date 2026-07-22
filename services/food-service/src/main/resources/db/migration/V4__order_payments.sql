-- Customer payment for an order (mirrors the ride trip payment).
-- UNPAID → (customer pays) → PAID for wallet/card/momo, or AWAITING for cash
-- until the vendor/courier confirms cash received → PAID.
ALTER TABLE orders ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID','AWAITING','PAID'));
ALTER TABLE orders ADD COLUMN payment_method VARCHAR(20);
