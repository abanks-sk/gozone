-- Each app gets its own set of users.
--
-- Identity used to be platform-wide: one phone number meant one account everywhere. Two things
-- fell out of that, both reported from a device. A passenger's number signed straight into the
-- driver app, because login only ever checked the number. And someone who already had a passenger
-- account could not sign up as a driver — /auth/register answered 409 "already registered" for an
-- account they had never created in that app, before issuing any OTP, which is why the code the
-- user was waiting for never arrived.
--
-- Phone, email and username are now unique *within* an app rather than across the platform, so the
-- same person can hold an independent passenger, driver and vendor account, each with its own
-- name, status and approval.

ALTER TABLE users ADD COLUMN app VARCHAR(20);

-- Existing accounts belong to the app matching the role they were created with. COURIER shares the
-- driver app: a courier is a driver carrying a parcel, not a separate product.
UPDATE users SET app = CASE role
    WHEN 'RIDER'            THEN 'PASSENGER'
    WHEN 'DRIVER'           THEN 'DRIVER'
    WHEN 'COURIER'          THEN 'DRIVER'
    WHEN 'RESTAURANT_OWNER' THEN 'VENDOR'
    ELSE 'ADMIN'
END;

ALTER TABLE users ALTER COLUMN app SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_app_check
    CHECK (app IN ('PASSENGER','DRIVER','VENDOR','ADMIN'));

ALTER TABLE users DROP CONSTRAINT users_phone_key;
ALTER TABLE users DROP CONSTRAINT users_email_key;
ALTER TABLE users DROP CONSTRAINT users_username_key;

-- NULLs compare as distinct in Postgres, so email-only and phone-only accounts still coexist.
ALTER TABLE users ADD CONSTRAINT users_phone_app_key    UNIQUE (phone, app);
ALTER TABLE users ADD CONSTRAINT users_email_app_key    UNIQUE (email, app);
ALTER TABLE users ADD CONSTRAINT users_username_app_key UNIQUE (username, app);

-- A code now belongs to an account rather than to a number. Once two accounts can share a number,
-- "the newest unconsumed code for this phone" no longer identifies who is signing in.
ALTER TABLE otp_codes ADD COLUMN app VARCHAR(20);

UPDATE otp_codes o SET app = u.app
  FROM users u
 WHERE (o.phone IS NOT NULL AND o.phone = u.phone)
    OR (o.email IS NOT NULL AND o.email = u.email);

-- Whatever is left belongs to a number that never finished signing up. Codes live five minutes, so
-- discarding them costs a retry at worst and beats guessing which app they were meant for.
DELETE FROM otp_codes WHERE app IS NULL;

ALTER TABLE otp_codes ALTER COLUMN app SET NOT NULL;
ALTER TABLE otp_codes ADD CONSTRAINT otp_codes_app_check
    CHECK (app IN ('PASSENGER','DRIVER','VENDOR','ADMIN'));

CREATE INDEX idx_otp_phone_app  ON otp_codes (phone, app);
CREATE INDEX idx_users_phone_app ON users (phone, app);
