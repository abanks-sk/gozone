-- GoZone Food Service — initial schema

CREATE TABLE restaurants (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID         NOT NULL,
    name         VARCHAR(100) NOT NULL,
    lat          NUMERIC(9,6) NOT NULL,
    lng          NUMERIC(9,6) NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'OPEN'
                     CHECK (status IN ('OPEN','CLOSED','PAUSED')),
    prep_minutes INT          NOT NULL DEFAULT 20,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE menu_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID           NOT NULL REFERENCES restaurants(id),
    name          VARCHAR(100)   NOT NULL,
    price         NUMERIC(10,2)  NOT NULL CHECK (price >= 0),
    available     BOOLEAN        NOT NULL DEFAULT TRUE
);

CREATE TABLE orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id   UUID          NOT NULL,
    restaurant_id UUID          NOT NULL REFERENCES restaurants(id),
    mode          VARCHAR(20)   NOT NULL CHECK (mode IN ('DELIVERY','PICKUP','WALKIN')),
    status        VARCHAR(30)   NOT NULL DEFAULT 'PLACED'
                      CHECK (status IN ('PLACED','CONFIRMED','PREPARING','READY',
                                        'OUT_FOR_DELIVERY','COMPLETED','CANCELLED')),
    delivery_addr TEXT,
    delivery_fee  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total         NUMERIC(10,2) NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID           NOT NULL REFERENCES orders(id),
    menu_item_id  UUID           NOT NULL REFERENCES menu_items(id),
    qty           SMALLINT       NOT NULL CHECK (qty > 0),
    unit_price    NUMERIC(10,2)  NOT NULL
);

-- Delivery is a courier job attached to a DELIVERY-mode order.
CREATE TABLE deliveries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID        NOT NULL UNIQUE REFERENCES orders(id),
    courier_id  UUID,
    status      VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED'
                    CHECK (status IN ('ASSIGNED','PICKED_UP','ENROUTE','DELIVERED')),
    assigned_at  TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ
);

-- Virtual queue for walk-in orders.
CREATE TABLE queue_entries (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID         NOT NULL REFERENCES restaurants(id),
    order_id      UUID         REFERENCES orders(id),
    position      INT          NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'WAITING'
                      CHECK (status IN ('WAITING','CALLED','SERVED')),
    joined_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE food_ratings (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID     NOT NULL UNIQUE REFERENCES orders(id),
    score      SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_customer    ON orders(customer_id);
CREATE INDEX idx_orders_restaurant  ON orders(restaurant_id, status);
CREATE INDEX idx_menu_restaurant    ON menu_items(restaurant_id);
CREATE INDEX idx_queue_restaurant   ON queue_entries(restaurant_id, status);
CREATE INDEX idx_deliveries_courier ON deliveries(courier_id, status);
