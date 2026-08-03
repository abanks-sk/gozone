-- Some uploads are meant to be seen by everyone.
--
-- Every upload so far has been a KYC document, so the rule was simple: only the owner or an admin
-- may read it. A vendor's shop logo and menu banner are the opposite — a customer browsing GoShop
-- has to be able to see them, and on the web an <Image> cannot attach an Authorization header, so
-- "signed in" is not a workable requirement either.
--
-- Rather than a second upload mechanism with its own storage, sniffing and traversal guards, the
-- existing one learns who a file is for. PRIVATE is the default, so nothing that exists today
-- changes and a new caller has to ask for public deliberately.

ALTER TABLE uploads ADD COLUMN visibility VARCHAR(10) NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE uploads ADD CONSTRAINT uploads_visibility_check
    CHECK (visibility IN ('PRIVATE', 'PUBLIC'));

COMMENT ON COLUMN uploads.visibility IS
    'PRIVATE: owner or admin only (KYC documents). PUBLIC: served to anyone (vendor storefront and '
    'menu imagery). Only a vendor or an admin may create a PUBLIC upload.';
