package com.gozone.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.jwt")
public class JwtProperties {
    private String secret;

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

    public String getSecret() { return secret; }
    public void setSecret(String secret) { this.secret = secret; }
    public long getExpiryMs() { return expiryMs; }
    public void setExpiryMs(long expiryMs) { this.expiryMs = expiryMs; }
    public long getRefreshExpiryMs() { return refreshExpiryMs; }
    public void setRefreshExpiryMs(long refreshExpiryMs) { this.refreshExpiryMs = refreshExpiryMs; }
    public String getIssuer() { return issuer; }
    public void setIssuer(String issuer) { this.issuer = issuer; }
    public String getAudience() { return audience; }
    public void setAudience(String audience) { this.audience = audience; }
}
