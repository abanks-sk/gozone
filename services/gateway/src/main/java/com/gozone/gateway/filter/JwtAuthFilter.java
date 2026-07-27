package com.gozone.gateway.filter;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import com.gozone.gateway.config.JwkCache;

import java.util.List;

/**
 * Edge JWT check at the gateway. Public paths pass through; all others must
 * carry a valid Bearer token. User identity is forwarded via X-User-* headers.
 * Each downstream service still validates the JWT independently (defence in depth).
 */
@Component
public class JwtAuthFilter implements GlobalFilter, Ordered {

    /** Pre-login paths that bypass the edge JWT check — driven by app.gateway.public-paths. */
    @Value("${app.gateway.public-paths}")
    private List<String> publicPaths;

    /**
     * Internal service-to-service paths (wallet settlement + notify dispatch).
     * These are guarded by the X-Internal-Key shared secret and are only ever
     * called service→service on the internal network — never legitimately from
     * an external client — so the public gateway blocks them outright.
     */
    private static final List<String> INTERNAL_ONLY_PATHS = List.of(
        "/wallet/commission",
        "/wallet/settle",
        "/wallet/pay/verify",
        "/wallet/charge",
        "/wallet/internal",
        "/notify",
        "/auth/delivery-riders"
    );

    /**
     * Verification keys, by kid, fetched from auth-service's JWKS and cached (the configured
     * JWT_PUBLIC_KEY stays as the fallback). The gateway checks signatures but never mints
     * tokens, so it is not given the private key — see RsaKeys / auth-service.
     */
    private final JwkCache jwks;

    public JwtAuthFilter(JwkCache jwks) {
        this.jwks = jwks;
    }

    /** Must match what auth-service stamps, so only tokens minted by us are accepted. */
    @Value("${app.jwt.issuer:gozone-auth}")
    private String jwtIssuer;

    @Value("${app.jwt.audience:gozone-apps}")
    private String jwtAudience;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getPath().toString();

        // Internal-only endpoints must not be reachable through the public edge,
        // even with a valid user token — reject before anything else.
        if (isInternalOnly(path)) {
            exchange.getResponse().setStatusCode(HttpStatus.NOT_FOUND);
            return exchange.getResponse().setComplete();
        }

        if (isPublicPath(path)) {
            return chain.filter(exchange);
        }

        String authHeader = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        try {
            String token = authHeader.substring(7);
            Claims claims = Jwts.parser()
                // The cache lookup is a map read — no network call on the request path, which
                // matters doubly here because this runs on the reactive event loop.
                .keyLocator(h -> jwks.resolve(h.get("kid")))
                .requireIssuer(jwtIssuer)
                .requireAudience(jwtAudience)
                .build()
                .parseSignedClaims(token)
                .getPayload();

            return chain.filter(exchange.mutate()
                .request(r -> r
                    .header("X-User-Id",   claims.getSubject())
                    .header("X-User-Role", claims.get("role", String.class)))
                .build());

        } catch (Exception e) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }
    }

    private boolean isPublicPath(String path) {
        return publicPaths.stream().anyMatch(path::startsWith)
            || path.contains("/actuator/");
    }

    private boolean isInternalOnly(String path) {
        return INTERNAL_ONLY_PATHS.stream().anyMatch(path::startsWith);
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
