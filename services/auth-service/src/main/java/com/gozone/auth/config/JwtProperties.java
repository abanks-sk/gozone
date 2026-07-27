package com.gozone.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.security.PrivateKey;
import java.security.PublicKey;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

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
     * Retired public keys, comma-separated, still published in the JWKS and still accepted here.
     *
     * <p>This is what makes key rotation gapless. Rotating in one step would invalidate every
     * token already in the wild, because an access token lives an hour and the client only finds
     * out when it 401s. Instead: publish the new key alongside the old one and restart auth
     * (verifiers pick both up on their next refresh), then switch signing to the new key and
     * restart auth again, then drop the old key here once an hour has passed. No other service
     * is redeployed at any point.
     */
    private String previousPublicKeys = "";

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
    private volatile Map<String, PublicKey> parsedAll;

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

    /** The {@code kid} stamped on tokens we mint — the current signing key's thumbprint. */
    public String signingKeyId() {
        return RsaKeys.thumbprint(verificationKey());
    }

    /**
     * Every key a token may legitimately have been signed with, by {@code kid}: the current one
     * first, then any retired keys still inside their token lifetime. This is both what the JWKS
     * publishes and what auth-service itself verifies against.
     */
    public Map<String, PublicKey> verificationKeys() {
        Map<String, PublicKey> keys = parsedAll;
        if (keys == null) {
            keys = new LinkedHashMap<>();
            PublicKey current = verificationKey();
            keys.put(RsaKeys.thumbprint(current), current);
            for (String encoded : previousPublicKeys.split(",")) {
                if (encoded.isBlank()) continue;
                PublicKey old = RsaKeys.publicKey(encoded.trim());
                keys.putIfAbsent(RsaKeys.thumbprint(old), old);
            }
            parsedAll = Collections.unmodifiableMap(keys);
        }
        return keys;
    }

    public String getPrivateKey() { return privateKey; }
    public void setPrivateKey(String privateKey) { this.privateKey = privateKey; }
    public String getPublicKey() { return publicKey; }
    public void setPublicKey(String publicKey) { this.publicKey = publicKey; }
    public String getPreviousPublicKeys() { return previousPublicKeys; }
    public void setPreviousPublicKeys(String previousPublicKeys) {
        this.previousPublicKeys = previousPublicKeys == null ? "" : previousPublicKeys;
    }
    public long getExpiryMs() { return expiryMs; }
    public void setExpiryMs(long expiryMs) { this.expiryMs = expiryMs; }
    public long getRefreshExpiryMs() { return refreshExpiryMs; }
    public void setRefreshExpiryMs(long refreshExpiryMs) { this.refreshExpiryMs = refreshExpiryMs; }
    public String getIssuer() { return issuer; }
    public void setIssuer(String issuer) { this.issuer = issuer; }
    public String getAudience() { return audience; }
    public void setAudience(String audience) { this.audience = audience; }
}
