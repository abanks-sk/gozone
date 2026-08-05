package com.gozone.food.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.Map;

/**
 * Reads user data from auth-service, which owns it — okada rider availability, and who a
 * customer actually is so their name can go on an order.
 */
@Service
public class AuthClient {

    private static final Logger log = LoggerFactory.getLogger(AuthClient.class);

    private final WebClient webClient;
    private final String internalKey;

    public AuthClient(WebClient.Builder builder,
                      @Value("${app.auth-url:http://localhost:8081}") String authUrl,
                      @Value("${app.internal.key}") String internalKey) {
        this.webClient = builder.baseUrl(authUrl).build();
        this.internalKey = internalKey;
    }

    /**
     * Whether at least one okada delivery rider is available right now. Fails OPEN
     * (returns true) if auth-service can't be reached, so a transient outage never
     * blocks a customer's checkout.
     */
    public boolean deliveryRidersAvailable() {
        try {
            Map<?, ?> res = webClient.get()
                .uri("/auth/delivery-riders/availability")
                .header("X-Internal-Key", internalKey)
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(3))
                .block();
            return res == null || Boolean.TRUE.equals(res.get("available"));
        } catch (Exception e) {
            log.warn("[AUTH-CLIENT] delivery-rider availability check failed, allowing order: {}", e.getMessage());
            return true; // fail open
        }
    }

    /** A customer's name and phone, or nulls if they can't be resolved. */
    public record Identity(String name, String phone) {}

    /**
     * Who this user is, for stamping onto an order.
     *
     * <p>Fails soft, and that is the point: this is called on the checkout path, and an order that
     * refuses to be placed because a name lookup timed out would trade a real sale for a cosmetic
     * label. The vendor falls back to showing the order number, exactly as before.
     */
    public Identity identity(java.util.UUID userId) {
        try {
            Map<?, ?> res = webClient.get()
                .uri("/auth/internal/users/{id}", userId)
                .header("X-Internal-Key", internalKey)
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(3))
                .block();
            if (res == null) return new Identity(null, null);
            return new Identity((String) res.get("name"), (String) res.get("phone"));
        } catch (Exception e) {
            log.warn("[AUTH-CLIENT] identity lookup failed for {}: {}", userId, e.getMessage());
            return new Identity(null, null);
        }
    }
}
