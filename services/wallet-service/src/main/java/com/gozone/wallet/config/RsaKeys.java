package com.gozone.wallet.config;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.interfaces.RSAPublicKey;
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

    /**
     * The key's <b>RFC 7638 JWK thumbprint</b>, used as its {@code kid}.
     *
     * <p>Derived from the key material rather than configured, so this service computes the same
     * kid for a key as auth-service does without either being told what to call it. That is what
     * lets the statically configured key and a key fetched from the JWKS be recognised as the
     * same key, and keeps a rotation from needing a shared "key name" kept in step across five
     * services.
     */
    public static String thumbprint(PublicKey key) {
        RSAPublicKey rsa = (RSAPublicKey) key;
        // RFC 7638: SHA-256 over the required members only, in lexicographic order, no whitespace.
        String canonical = "{\"e\":\"" + b64url(rsa.getPublicExponent())
            + "\",\"kty\":\"RSA\",\"n\":\"" + b64url(rsa.getModulus()) + "\"}";
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(canonical.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException("cannot compute JWK thumbprint: " + e.getMessage(), e);
        }
    }

    /** base64url of the unsigned big-endian magnitude, as JWK requires (no sign byte, no padding). */
    private static String b64url(BigInteger value) {
        byte[] bytes = value.toByteArray();
        // BigInteger.toByteArray() prefixes a zero byte when the high bit is set; JWK must not.
        if (bytes.length > 1 && bytes[0] == 0) {
            byte[] trimmed = new byte[bytes.length - 1];
            System.arraycopy(bytes, 1, trimmed, 0, trimmed.length);
            bytes = trimmed;
        }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
