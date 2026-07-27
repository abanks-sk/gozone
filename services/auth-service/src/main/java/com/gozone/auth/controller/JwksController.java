package com.gozone.auth.controller;

import com.gozone.auth.config.JwtProperties;
import com.gozone.auth.config.RsaKeys;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.PublicKey;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Publishes auth-service's signing keys as a JWKS document.
 *
 * <p>Before this existed, every service carried the public key as configuration
 * ({@code JWT_PUBLIC_KEY}), so rotating the key pair meant editing the environment of all five
 * services and redeploying all five together. Now they fetch the key from here and cache it, and
 * a rotation is a restart of auth-service alone.
 *
 * <p>This does not weaken the "never call auth-service to validate a token" rule. Verifiers still
 * check every signature locally against a cached key; what they fetch is the <em>key</em>, once
 * per refresh interval, not a verdict on a token. And the static {@code JWT_PUBLIC_KEY} is kept as
 * a fallback, so a verifier boots and keeps working even when auth-service is unreachable.
 *
 * <p>Deliberately public and unauthenticated: a public key is public by definition — it verifies
 * signatures and cannot create them. Publishing it costs nothing, which is the entire premise of
 * moving off the shared HS512 secret.
 */
@RestController
public class JwksController {

    private final JwtProperties props;

    public JwksController(JwtProperties props) {
        this.props = props;
    }

    @GetMapping("/.well-known/jwks.json")
    public ResponseEntity<Map<String, Object>> jwks() {
        List<Map<String, String>> keys = props.verificationKeys().values().stream()
            .map((PublicKey key) -> RsaKeys.toJwk(key))
            .toList();

        // Cacheable, but well under the verifiers' own refresh interval so an intermediary
        // can't hold a rotation back longer than the services themselves would.
        return ResponseEntity.ok()
            .cacheControl(CacheControl.maxAge(5, TimeUnit.MINUTES).cachePublic())
            .body(Map.of("keys", keys));
    }
}
