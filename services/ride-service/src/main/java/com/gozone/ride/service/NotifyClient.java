package com.gozone.ride.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * Sends a push notification to a user, via wallet-service's notification dispatcher.
 *
 * <p>ride-service had no way to reach a user outside the app. Everything it had to say — your
 * driver is here — was only visible if you happened to be looking at the tracking screen, which
 * is exactly when you are least likely to be: you are watching the road for a car.
 *
 * <p>Deliberately fail-soft. A notification is a courtesy on top of the trip, never a condition
 * of it, so a notification outage must not fail the request that triggered it.
 */
@Service
public class NotifyClient {

    private static final Logger log = LoggerFactory.getLogger(NotifyClient.class);

    private final WebClient webClient;
    private final String internalKey;

    public NotifyClient(WebClient.Builder builder,
                        @Value("${app.services.notify-url:http://localhost:8084/notify}") String notifyUrl,
                        @Value("${app.internal.key}") String internalKey) {
        this.webClient = builder.baseUrl(notifyUrl).build();
        this.internalKey = internalKey;
    }

    public void send(UUID userId, String title, String body) {
        try {
            webClient.post()
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Internal-Key", internalKey)
                .bodyValue(Map.of("userId", userId.toString(), "title", title, "body", body))
                .retrieve()
                .bodyToMono(Void.class)
                .timeout(Duration.ofSeconds(5))
                .block();
        } catch (Exception e) {
            log.warn("[NOTIFY] could not notify user={} ({}): {}", userId, title, e.getMessage());
        }
    }
}
