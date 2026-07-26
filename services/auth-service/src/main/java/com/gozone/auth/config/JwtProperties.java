package com.gozone.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.security.PrivateKey;
import java.security.PublicKey;

@Component
@ConfigurationProperties(prefix = "app.jwt")
public class JwtProperties {

    /**
     * RSA keys, base64 of the DER bytes (see {@link RsaKeys}).
     *
     * <p>auth-service is the only service that gets the private key, because it is the only one
     * that mints tokens. Everything else verifies with the public key, which cannot sign. Under
     * the previous shared-secret scheme every service held a key that could mint an admin token —
     * so a break anywhere was a break everywhere.
     */
    private String privateKey;
    private String publicKey;

    /**
     * Access-token lifetime. Short on purpose: an access token can't be revoked, so its
     * expiry is the only thing that ends it. Clients hold a 7-day refresh token and swap it
     * for a new access token, and a refresh token CAN be revoked (logout).
     */
    private long expiryMs = 3_600_000L;          // 1h
    private long refreshExpiryMs = 604_800_000L; // 7 days

    /** Stamped as `iss`/`aud` and required by every verifier, so only our own tokens pass. */
    private String issuer = "gozone-auth";
    private String audience = "gozone-apps";

    // Parsed once — decoding on every request would be wasteful, and a bad key should fail
    // loudly on first use rather than silently per-request.
    private volatile PrivateKey parsedPrivate;
    private volatile PublicKey parsedPublic;

    public PrivateKey signingKey() {
        PrivateKey k = parsedPrivate;
        if (k == null) {
            k = RsaKeys.privateKey(privateKey);
            parsedPrivate = k;
        }
        return k;
    }

    public PublicKey verificationKey() {
        PublicKey k = parsedPublic;
        if (k == null) {
            k = RsaKeys.publicKey(publicKey);
            parsedPublic = k;
        }
        return k;
    }

    public String getPrivateKey() { return privateKey; }
    public void setPrivateKey(String privateKey) { this.privateKey = privateKey; }
    public String getPublicKey() { return publicKey; }
    public void setPublicKey(String publicKey) { this.publicKey = publicKey; }
    public long getExpiryMs() { return expiryMs; }
    public void setExpiryMs(long expiryMs) { this.expiryMs = expiryMs; }
    public long getRefreshExpiryMs() { return refreshExpiryMs; }
    public void setRefreshExpiryMs(long refreshExpiryMs) { this.refreshExpiryMs = refreshExpiryMs; }
    public String getIssuer() { return issuer; }
    public void setIssuer(String issuer) { this.issuer = issuer; }
    public String getAudience() { return audience; }
    public void setAudience(String audience) { this.audience = audience; }
}
