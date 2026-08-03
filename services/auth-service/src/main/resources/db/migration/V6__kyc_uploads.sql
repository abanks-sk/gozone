-- Real KYC documents, replacing the placeholder URLs.
--
-- Until now a driver "uploaded" documents by tapping a row that set a hardcoded
-- `https://placeholder.example/kyc/roadworthy.pdf` — nothing was ever sent, so an admin approving
-- a driver was approving a string. This is the record behind actual files.
--
-- ## Why a table and not just a folder
--
-- These are identity documents: a driver's face, their licence, their vehicle. Serving them as
-- plain static files would mean anyone holding (or guessing) a URL could read a stranger's ID.
-- Recording the owner is what lets the download endpoint refuse everyone except that driver and
-- an admin. The row is the access-control list; the folder is only bytes.
--
-- `stored_name` is generated server-side, never taken from the client: an uploaded filename is
-- attacker-controlled and "../../application.yml" is a real thing people try.
CREATE TABLE IF NOT EXISTS uploads (
    id           UUID PRIMARY KEY,
    owner_id     UUID        NOT NULL REFERENCES users(id),
    stored_name  TEXT        NOT NULL,
    content_type TEXT        NOT NULL,
    size_bytes   BIGINT      NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploads_owner ON uploads(owner_id);

-- The three pictures the reviewer actually needs. `id_selfie_url` already existed and becomes the
-- driver's own photo; these two are new. `roadworthy_url` stays as the optional certificate.
-- All nullable: submissions made before this change keep working, they simply have no images.
ALTER TABLE driver_kyc ADD COLUMN IF NOT EXISTS licence_url       TEXT;
ALTER TABLE driver_kyc ADD COLUMN IF NOT EXISTS vehicle_photo_url TEXT;
