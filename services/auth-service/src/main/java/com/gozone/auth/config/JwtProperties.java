package com.gozone.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.jwt")
public class JwtProperties {
    private String secret;
    private long expiryMs = 86_400_000L;        // 24h
    private long refreshExpiryMs = 604_800_000L; // 7 days

    public String getSecret() { return secret; }
    public void setSecret(String secret) { this.secret = secret; }
    public long getExpiryMs() { return expiryMs; }
    public void setExpiryMs(long expiryMs) { this.expiryMs = expiryMs; }
    public long getRefreshExpiryMs() { return refreshExpiryMs; }
    public void setRefreshExpiryMs(long refreshExpiryMs) { this.refreshExpiryMs = refreshExpiryMs; }
}
