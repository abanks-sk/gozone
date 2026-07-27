package com.gozone.food.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Token claims this service insists on.
 *
 * <p>The verification <b>key</b> deliberately does not live here — {@link JwkCache} owns it,
 * because a key is no longer a single configured value: it is a set fetched from auth-service's
 * JWKS and selected per token by {@code kid}. Keeping a second copy here would leave two places
 * that both look like the answer, and eventually they would disagree.
 */
@Component
@ConfigurationProperties(prefix = "app.jwt")
public class JwtProperties {

    /** Required on every token we accept, so a token minted elsewhere can't be replayed here. */
    private String issuer = "gozone-auth";
    private String audience = "gozone-apps";

    public String getIssuer() { return issuer; }
    public void setIssuer(String issuer) { this.issuer = issuer; }
    public String getAudience() { return audience; }
    public void setAudience(String audience) { this.audience = audience; }
}
