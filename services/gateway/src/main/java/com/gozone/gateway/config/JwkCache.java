package com.gozone.gateway.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.Key;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.RSAPublicKeySpec;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Holds the public keys this service will verify tokens with, keyed by {@code kid}.
 *
 * <p>Keys come from auth-service's JWKS endpoint and are cached. Previously the public key was
 * configuration in all five services, so rotating the pair meant a coordinated redeploy of
 * everything; now only auth-service restarts and the rest pick the new key up on their next
 * refresh.
 *
 * <p><b>This is not "ask auth to validate the token".</b> Signature checking still happens
 * entirely in this process, against a cached key, with no network call on the request path. What
 * crosses the network is the key itself, once per refresh interval. The statically configured
 * {@code JWT_PUBLIC_KEY} is retained as a floor, so this service boots and keeps verifying even
 * if auth-service is down or the JWKS URL is unset.
 *
 * <p>Refreshes happen on a background daemon thread, never inline in a request — the gateway is
 * reactive and a blocking fetch on the event loop would stall it, and even in the servlet
 * services a slow auth-service must not become a slow request.
 */
@Component
public class JwkCache {

    private static final Logger log = LoggerFactory.getLogger(JwkCache.class);

    /**
     * Shortest gap between fetches triggered by an unknown kid. Without it, a flood of tokens
     * carrying junk kids would turn into a flood of requests to auth-service — a free
     * amplification vector aimed at the one service everything else depends on.
     */
    private static final long MIN_REFRESH_GAP_MS = 30_000L;

    /**
     * Retry gap before the first successful fetch. At compose start-up this service can be up
     * before auth-service is listening, and waiting a full refresh interval to try again would
     * leave it running on the fallback key for five minutes for no reason.
     */
    private static final long BOOTSTRAP_RETRY_MS = 15_000L;

    private final String staticKeyEncoded;
    private final String jwksUrl;
    private final long refreshMs;

    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(4))
        .build();

    private final AtomicBoolean refreshing = new AtomicBoolean(false);
    private final AtomicBoolean everSucceeded = new AtomicBoolean(false);
    private volatile long lastAttemptMs = 0L;
    private volatile PublicKey staticKey;
    private volatile Map<String, PublicKey> keys = Map.of();
    private ScheduledExecutorService scheduler;

    public JwkCache(@Value("${app.jwt.public-key}") String staticKeyEncoded,
                    @Value("${app.jwt.jwks-url:}") String jwksUrl,
                    @Value("${app.jwt.jwks-refresh-ms:300000}") long refreshMs) {
        this.staticKeyEncoded = staticKeyEncoded;
        this.jwksUrl = jwksUrl == null ? "" : jwksUrl.trim();
        this.refreshMs = refreshMs;
    }

    @PostConstruct
    void start() {
        // The configured key is the floor: parsed eagerly so a bad value fails at boot, loudly,
        // rather than as a puzzling 401 on the first request.
        staticKey = RsaKeys.publicKey(staticKeyEncoded);
        Map<String, PublicKey> seed = new LinkedHashMap<>();
        seed.put(RsaKeys.thumbprint(staticKey), staticKey);
        keys = Map.copyOf(seed);

        if (jwksUrl.isEmpty()) {
            log.info("JWKS URL not set - verifying with the configured key only");
            return;
        }
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "jwk-refresh");
            t.setDaemon(true); // must never hold up shutdown
            return t;
        });
        // Small initial delay rather than zero: at compose start-up auth-service may still be
        // coming up, and there is no need to race it — the configured key already works.
        scheduler.scheduleWithFixedDelay(this::refresh, 5_000L, refreshMs, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    void stop() {
        if (scheduler != null) scheduler.shutdownNow();
    }

    /**
     * The key for a token's {@code kid}, or the configured key when the token carries no kid or
     * names one we have not seen. An unknown kid also schedules a refresh, because the usual
     * reason to see one is that auth-service has just rotated.
     */
    public Key resolve(Object kid) {
        if (kid != null) {
            PublicKey found = keys.get(kid.toString());
            if (found != null) return found;
            refreshSoon();
        }
        return staticKey;
    }

    private void refreshSoon() {
        if (scheduler == null) return;
        if (System.currentTimeMillis() - lastAttemptMs < MIN_REFRESH_GAP_MS) return;
        scheduler.execute(this::refresh);
    }

    private void refresh() {
        if (jwksUrl.isEmpty() || !refreshing.compareAndSet(false, true)) return;
        lastAttemptMs = System.currentTimeMillis();
        boolean ok = false;
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(jwksUrl))
                .timeout(Duration.ofSeconds(6))
                .GET()
                .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("JWKS fetch from {} returned {}", jwksUrl, response.statusCode());
                return;
            }

            Map<String, PublicKey> fetched = new LinkedHashMap<>();
            for (JsonNode jwk : json.readTree(response.body()).path("keys")) {
                if (!"RSA".equals(jwk.path("kty").asText())) continue;
                String kid = jwk.path("kid").asText(null);
                if (kid == null) continue;
                try {
                    fetched.put(kid, toPublicKey(jwk.path("n").asText(), jwk.path("e").asText()));
                } catch (Exception e) {
                    log.warn("JWKS key {} could not be read: {}", kid, e.getMessage());
                }
            }
            if (fetched.isEmpty()) {
                // Keep whatever we already had. An empty or malformed document must not be able
                // to strip this service of its keys and 401 every user on the platform.
                log.warn("JWKS from {} held no usable RSA keys - keeping the current set", jwksUrl);
                return;
            }

            // The configured key stays in the set as a floor, in case it is not published.
            fetched.putIfAbsent(RsaKeys.thumbprint(staticKey), staticKey);
            boolean changed = !fetched.keySet().equals(keys.keySet());
            keys = Map.copyOf(fetched);
            ok = true;

            // Announce the first success and every subsequent change, but stay quiet on the
            // routine no-op refresh. Without the first-success line there is no way to tell a
            // working fetch from one that never ran, since an unchanged key set logs nothing.
            if (everSucceeded.compareAndSet(false, true) || changed) {
                log.info("JWKS loaded from {} - verifying with kids {}", jwksUrl, keys.keySet());
            }

        } catch (Exception e) {
            // Fail soft: the previously cached keys (and the configured one) still verify.
            // Include the exception type — a bare getMessage() is null for the connection
            // failures this most often hits, which reads as "failed: null" and says nothing.
            log.warn("JWKS fetch from {} failed: {}: {}",
                jwksUrl, e.getClass().getSimpleName(), e.getMessage());
        } finally {
            refreshing.set(false);
            // Before the first success, come back soon rather than waiting a whole interval.
            if (!ok && !everSucceeded.get() && scheduler != null && !scheduler.isShutdown()) {
                try {
                    scheduler.schedule(this::refresh, BOOTSTRAP_RETRY_MS, TimeUnit.MILLISECONDS);
                } catch (Exception ignored) {
                    // Shutting down — the periodic schedule will cover it if we come back.
                }
            }
        }
    }

    private static PublicKey toPublicKey(String n, String e) throws Exception {
        Base64.Decoder b64 = Base64.getUrlDecoder();
        return KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(
            new BigInteger(1, b64.decode(n)),
            new BigInteger(1, b64.decode(e))));
    }
}
