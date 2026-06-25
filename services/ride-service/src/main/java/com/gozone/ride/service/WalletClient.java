package com.gozone.ride.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * Synchronous REST call to wallet-service on trip completion.
 * Production would use an outbox/saga — documented in architecture.md.
 */
@Service
public class WalletClient {

    private static final Logger log = LoggerFactory.getLogger(WalletClient.class);

    private final WebClient webClient;

    public WalletClient(WebClient.Builder builder,
                        @Value("${app.wallet-url:http://localhost:8084}") String walletUrl) {
        this.webClient = builder.baseUrl(walletUrl).build();
    }

    public void settleRide(UUID tripId, UUID driverId, BigDecimal agreedFare) {
        try {
            webClient.post()
                .uri("/wallet/commission")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of(
                    "tripId", tripId.toString(),
                    "driverId", driverId.toString(),
                    "agreedFare", agreedFare
                ))
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(5))
                .block();
            log.info("[WALLET-CLIENT] ride settled tripId={}", tripId);
        } catch (Exception e) {
            log.error("[WALLET-CLIENT] settleRide failed tripId={}: {}", tripId, e.getMessage());
        }
    }
}
