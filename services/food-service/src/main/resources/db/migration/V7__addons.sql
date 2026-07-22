-- Add-on groups & options a customer can choose for a menu item (e.g. protein, size,
-- extras), plus the chosen add-ons recorded on each order line.
CREATE TABLE addon_groups (
    id           UUID PRIMARY KEY,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    multi        BOOLEAN NOT NULL DEFAULT false,   -- false = pick one, true = pick many
    required     BOOLEAN NOT NULL DEFAULT false,
    position     INT NOT NULL DEFAULT 0
);

CREATE TABLE addon_options (
    id        UUID PRIMARY KEY,
    group_id  UUID NOT NULL REFERENCES addon_groups(id) ON DELETE CASCADE,
    label     VARCHAR(100) NOT NULL,
    price     NUMERIC(10,2) NOT NULL DEFAULT 0,
    position  INT NOT NULL DEFAULT 0
);

CREATE TABLE order_item_addons (
    id            UUID PRIMARY KEY,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    label         VARCHAR(100) NOT NULL,
    price         NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX idx_addon_groups_item ON addon_groups(menu_item_id);
CREATE INDEX idx_addon_options_group ON addon_options(group_id);
