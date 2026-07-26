package com.gozone.auth.config;

import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
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
 * Generate a pair with:
 * <pre>
 * openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -outform DER -out priv.der
 * openssl rsa -inform DER -in priv.der -pubout -outform DER -out pub.der
 * base64 -w0 priv.der    # JWT_PRIVATE_KEY  (auth-service only)
 * base64 -w0 pub.der     # JWT_PUBLIC_KEY   (every service)
 * </pre>
 */
public final class RsaKeys {

    private RsaKeys() {}

    public static PrivateKey privateKey(String base64Der) {
        try {
            byte[] der = decode(base64Der, "JWT_PRIVATE_KEY");
            return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));
        } catch (Exception e) {
            throw new IllegalStateException(
                "JWT_PRIVATE_KEY is not a base64-encoded PKCS#8 RSA key: " + e.getMessage(), e);
        }
    }

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
