-- Cap OTP guesses: after too many wrong attempts the code is consumed (invalidated).
ALTER TABLE otp_codes ADD COLUMN attempts INT NOT NULL DEFAULT 0;
