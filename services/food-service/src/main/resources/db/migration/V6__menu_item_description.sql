-- Vendors can now describe their items; the description flows to the customer menu.
ALTER TABLE menu_items ADD COLUMN description TEXT;
