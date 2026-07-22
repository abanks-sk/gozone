-- Onboarding overhaul: display name, admin credentials, approval lifecycle.

ALTER TABLE users ADD COLUMN name          VARCHAR(100);
ALTER TABLE users ADD COLUMN username      VARCHAR(50) UNIQUE;   -- admins log in by username
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);          -- admins only (NULL for OTP users)

-- SUPER_ADMIN can create other admins; ADMIN approves drivers/vendors.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('RIDER','DRIVER','RESTAURANT_OWNER','COURIER','ADMIN','SUPER_ADMIN'));

-- Drivers & vendors sign up PENDING until an admin approves (or REJECTED).
ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
    CHECK (status IN ('ACTIVE','SUSPENDED','PENDING','REJECTED'));
