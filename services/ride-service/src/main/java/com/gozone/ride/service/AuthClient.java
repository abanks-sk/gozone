package com.gozone.ride.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * Reads identity from auth-service, which owns User data.
 *
 * <p>Exists so a driver or courier can be told who they are carrying. The passenger's phone was
 * already stored on the request, but it came from the client — the app sent whatever was in its
 * own profile store. Looking it up here means the name and number on a job are the ones the
 * account actually holds, which matters when they are what a courier uses to identify somebody
 * at a door.
 */
@Service
public class AuthClient {

    private static final Logger log = LoggerFactory.getLogger(AuthClient.class);

    private final WebClient webClient;
    private final String internalKey;

    public AuthClient(WebClient.Builder builder,
                      @Value("${app.services.auth-url:http://localhost:8081}") String authUrl,
                      @Value("${app.internal.key}") String internalKey) {
        this.webClient = builder.baseUrl(authUrl).build();
        this.internalKey = internalKey;
    }

    /** A user's name and phone, or nulls when they can't be resolved. */
    public record Identity(String name, String phone) {}

    /**
     * Who this user is.
     *
     * <p>Fails soft. This runs on the request-creation path, and a ride that refused to be booked
     * because a name lookup timed out would trade the whole journey for a label.
     */
    public Identity identity(UUID userId) {
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
