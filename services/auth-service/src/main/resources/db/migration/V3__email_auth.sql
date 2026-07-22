-- Email + OTP auth: email becomes an alternate identity, so an account may have a
-- phone OR an email (or both). OTP codes can now be keyed by email as well as phone.

ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users ADD COLUMN email VARCHAR(255);
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE otp_codes ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE otp_codes ADD COLUMN email VARCHAR(255);
