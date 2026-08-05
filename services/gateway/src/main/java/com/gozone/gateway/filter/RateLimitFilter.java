package com.gozone.gateway.filter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Per-caller request throttling at the edge, ahead of the JWT check.
 *
 * Two buckets, because the risk is not uniform: the pre-login endpoints hand out OTPs and
 * accept credentials, so they get a tighter allowance (a flood there is either someone guessing
 * codes or someone burning our SMS budget). Everything else gets a generous allowance meant to
 * stop a runaway client, not to shape normal traffic — the apps poll every few seconds by design.
 *
 * <p><b>Why the limits aren't tiny.</b> Counting is per IP, and Ghanaian mobile networks NAT
 * many subscribers behind one address, so a limit sized for "one person" would lock out a whole
 * carrier. These numbers are set to absorb dozens of genuine users sharing an IP while still
 * being far below what an attacker needs. Guessing a specific account's OTP is bounded
 * separately and much more tightly, by the 5-attempt cap on the code itself — that per-account
 * control is what actually protects an account; this filter protects the service.
 *
 * <p>Counting is in-memory, per gateway instance, in fixed windows. That is deliberate for a
 * single-instance deployment and it keeps the request path free of a network hop. Running more
 * than one gateway makes the limit per-instance rather than global; that is the point at which
 * this should move to Spring Cloud Gateway's Redis rate limiter (`RequestRateLimiter`), which
 * shares one counter across instances.
 */
@Component
public class RateLimitFilter implements GlobalFilter, Ordered {

    /** Endpoints that issue codes or accept credentials — throttled hard. */
    private static final List<String> SENSITIVE_PREFIXES = List.of(
        "/auth/register", "/auth/register-email",
        "/auth/login", "/auth/login-email", "/auth/login-email-password",
        "/auth/verify-otp", "/auth/admin/login", "/auth/google",
        "/auth/me/phone", "/auth/me/email",
        // Password reset belongs in the hard bucket on both counts: one end emails a code, the
        // other accepts a code and sets a credential.
        "/auth/forgot-password", "/auth/reset-password"
    );

    @Value("${app.ratelimit.enabled:true}")
    private boolean enabled;

    /** Sign-in / OTP allowance per caller per window. */
    @Value("${app.ratelimit.auth-per-window:40}")
    private int authLimit;

    /** Everything else, per caller per window. */
    @Value("${app.ratelimit.default-per-window:600}")
    private int defaultLimit;

    @Value("${app.ratelimit.window-seconds:60}")
    private long windowSeconds;

    private final Map<String, Counter> counters = new ConcurrentHashMap<>();

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        if (!enabled) return chain.filter(exchange);

        String path = exchange.getRequest().getPath().toString();
        // Health checks are how the container knows the service is alive — never throttle them.
        if (path.startsWith("/actuator")) return chain.filter(exchange);

        boolean sensitive = SENSITIVE_PREFIXES.stream().anyMatch(path::startsWith);
        int limit = sensitive ? authLimit : defaultLimit;
        String key = (sensitive ? "auth|" : "any|") + caller(exchange);

        long window = System.currentTimeMillis() / (windowSeconds * 1000L);
        Counter counter = counters.compute(key, (k, existing) ->
            existing == null || existing.window != window ? new Counter(window) : existing);

        if (counter.hits.incrementAndGet() > limit) {
            var response = exchange.getResponse();
            response.setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
            response.getHeaders().add("Retry-After", String.valueOf(secondsLeftInWindow(window)));
            return response.setComplete();
        }

        // Keep the map from growing without bound on a long-running instance.
        if (counters.size() > 10_000) counters.entrySet().removeIf(e -> e.getValue().window != window);

        return chain.filter(exchange);
    }

    /**
     * Who to count against. Behind a load balancer the socket address is the balancer, so
     * X-Forwarded-For (first hop) is preferred when present.
     */
    private String caller(ServerWebExchange exchange) {
        String forwarded = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        var remote = exchange.getRequest().getRemoteAddress();
        return remote != null ? remote.getAddress().getHostAddress() : "unknown";
    }

    private long secondsLeftInWindow(long window) {
        long windowEndMs = (window + 1) * windowSeconds * 1000L;
        return Math.max(1, Duration.ofMillis(windowEndMs - System.currentTimeMillis()).toSeconds());
    }

    private static final class Counter {
        final long window;
        final AtomicInteger hits = new AtomicInteger();
        Counter(long window) { this.window = window; }
    }

    /** Ahead of the JWT filter (-100): a flood shouldn't reach signature verification. */
    @Override
    public int getOrder() {
        return -200;
    }
}
