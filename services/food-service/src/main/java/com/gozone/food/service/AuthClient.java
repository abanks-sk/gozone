package com.gozone.food.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.Map;

/**
 * Reads okada delivery-rider availability from auth-service (which owns User data).
 * Used to reject delivery orders up-front when no rider can fulfil them.
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
}
