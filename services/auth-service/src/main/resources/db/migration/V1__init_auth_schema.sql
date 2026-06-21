-- V1: Initial schema for the Auth service

CREATE TABLE users (
    id          BIGSERIAL PRIMARY KEY,
    phone       VARCHAR(20) UNIQUE NOT NULL,
    role        VARCHAR(20) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE otp_codes (
    id          BIGSERIAL PRIMARY KEY,
    phone       VARCHAR(20) NOT NULL,
    code        VARCHAR(6) NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP
);

CREATE TABLE refresh_tokens (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id),
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE driver_kyc (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    licence_no      VARCHAR(50) NOT NULL,
    vehicle_reg     VARCHAR(50) NOT NULL,
    roadworthy_url  VARCHAR(255),
    id_selfie_url   VARCHAR(255),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reviewed_by     BIGINT REFERENCES users(id),
    expiry_date     DATE
);