package com.gozone.food.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.security.PublicKey;

@Component
@ConfigurationProperties(prefix = "app.jwt")
public class JwtProperties {

    /**
     * RSA public key (base64 DER) used to verify tokens minted by auth-service. Public by
     * design — it cannot sign, so leaking it costs nothing. This service is deliberately not
     * given the private key.
     */
    private String publicKey;

    /** Required on every token we accept, so a token minted elsewhere can't be replayed here. */
    private String issuer = "gozone-auth";
    private String audience = "gozone-apps";

    private volatile PublicKey parsed;

    public PublicKey verificationKey() {
        PublicKey k = parsed;
        if (k == null) {
            k = RsaKeys.publicKey(publicKey);
            parsed = k;
        }
        return k;
    }

    public String getPublicKey() { return publicKey; }
    public void setPublicKey(String publicKey) { this.publicKey = publicKey; }
    public String getIssuer() { return issuer; }
    public void setIssuer(String issuer) { this.issuer = issuer; }
    public String getAudience() { return audience; }
    public void setAudience(String audience) { this.audience = audience; }
}
