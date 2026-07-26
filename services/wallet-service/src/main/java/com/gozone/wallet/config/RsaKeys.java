package com.gozone.wallet.config;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * Decodes the RSA signing keys from configuration.
 *
 * Keys are supplied as <b>single-line base64 of the DER bytes</b> (PKCS#8 for the private key,
 * X.509/SubjectPublicKeyInfo for the public one) rather than PEM. PEM is multi-line, and
 * multi-line values in .env files and Compose interpolation are a reliable source of
 * "works on my machine" breakage; one long base64 string travels through env vars intact.
 *
 * This service only ever verifies, so it only ever holds the public key — it is not given the
 * private key and therefore cannot mint a token even if it is compromised.
 */
public final class RsaKeys {

    private RsaKeys() {}

    public static PublicKey publicKey(String base64Der) {
        try {
            byte[] der = decode(base64Der, "JWT_PUBLIC_KEY");
            return KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
        } catch (Exception e) {
            throw new IllegalStateException(
                "JWT_PUBLIC_KEY is not a base64-encoded X.509 RSA key: " + e.getMessage(), e);
        }
    }

    private static byte[] decode(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(name + " is not set — see .env.example");
        }
        // Tolerate a pasted PEM block: strip the header/footer and any line breaks.
        String cleaned = value
            .replaceAll("-----[A-Z ]+-----", "")
            .replaceAll("\\s", "");
        return Base64.getDecoder().decode(cleaned);
    }
}
