-- Admin-controlled promo cards shown on the customer shop browse.
-- vendor_id (loose ref, no FK) = the promoted vendor; category = a promoted cuisine;
-- both nullable (a generic promo links to neither).
CREATE TABLE promos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title      VARCHAR(80)  NOT NULL,
    subtitle   VARCHAR(120),
    color      VARCHAR(16)  NOT NULL DEFAULT '#2563EB',
    vendor_id  UUID,
    category   VARCHAR(40),
    active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO promos (title, subtitle, color, category, active) VALUES
  ('20% off your first order', 'New to GoShop? Save on us', '#2563EB', NULL, TRUE),
  ('Free delivery', 'On orders over GH₵ 50', '#0EA5E9', NULL, TRUE),
  ('Buy 1, get 1', 'Selected meals this week', '#E11D48', 'Local', TRUE);
