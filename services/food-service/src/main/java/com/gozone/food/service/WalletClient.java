package com.gozone.food.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * Synchronous REST call to wallet-service on order completion.
 * Production would use an outbox/saga — documented in architecture.md.
 */
@Service
public class WalletClient {

    private static final Logger log = LoggerFactory.getLogger(WalletClient.class);

    private final WebClient webClient;
    private final String internalKey;

    public WalletClient(WebClient.Builder builder,
                        @Value("${app.services.wallet-url:http://localhost:8084}") String walletUrl,
                        @Value("${app.internal.key}") String internalKey) {
        this.webClient = builder.baseUrl(walletUrl).build();
        this.internalKey = internalKey;
    }

    /** Confirm a Paystack payment (card/momo) covered the order total, before marking it paid. */
    public boolean verifyPayment(BigDecimal amount, String reference) {
        try {
            Map<?, ?> res = webClient.post()
                .uri("/wallet/pay/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Internal-Key", internalKey)
                .bodyValue(Map.of("amount", amount, "reference", reference))
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(5))
                .block();
            return res != null && Boolean.TRUE.equals(res.get("verified"));
        } catch (Exception e) {
            log.error("[WALLET-CLIENT] verifyPayment failed ref={}: {}", reference, e.getMessage());
            return false;
        }
    }

    /**
     * Charge the customer's GoZone wallet. Throws when the balance won't cover it, so the caller
     * must not mark the order paid — unlike the rest of this client, a failure here is fatal to
     * the operation rather than something to log and move past.
     */
    public void chargeWallet(UUID userId, BigDecimal amount, UUID orderId) {
        try {
            webClient.post()
                .uri("/wallet/charge")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Internal-Key", internalKey)
                .bodyValue(Map.of(
                    "userId", userId.toString(),
                    "amount", amount,
                    "refId", orderId.toString(),
                    "refType", "ORDER"
                ))
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(5))
                .block();
        } catch (WebClientResponseException e) {
            // Pass the wallet's own message through (e.g. "Your GoZone wallet has GH₵ 3.00 …").
            log.warn("[WALLET-CLIENT] wallet charge refused order={}: {}", orderId, e.getResponseBodyAsString());
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED, messageFrom(e,
                "Your GoZone wallet doesn't have enough for this order."));
        } catch (Exception e) {
            log.error("[WALLET-CLIENT] wallet charge failed order={}: {}", orderId, e.getMessage());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Couldn't reach your wallet just now. Please try again.");
        }
    }

    private static String messageFrom(WebClientResponseException e, String fallback) {
        try {
            String body = e.getResponseBodyAsString();
            int i = body.indexOf("\"message\":\"");
            if (i >= 0) {
                int start = i + 11, end = body.indexOf('"', start);
                if (end > start) return body.substring(start, end);
            }
        } catch (Exception ignored) {}
        return fallback;
    }

    /**
     * A courier's wallet balance. Negative means they are holding GoZone's cash and owe it in.
     * Returns null if the wallet can't be reached — the caller treats that as "don't block".
     */
    public BigDecimal courierBalance(UUID courierId) {
        try {
            Map<?, ?> res = webClient.get()
                .uri(uri -> uri.path("/wallet/internal/balance")
                    .queryParam("userId", courierId.toString())
                    .queryParam("ownerType", "DRIVER").build())
                .header("X-Internal-Key", internalKey)
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(5))
                .block();
            return res == null ? null : new BigDecimal(String.valueOf(res.get("balance")));
        } catch (Exception e) {
            log.error("[WALLET-CLIENT] courierBalance failed courier={}: {}", courierId, e.getMessage());
            return null;
        }
    }

    /** Settle a paid, completed order — vendor, courier and platform each get their share. */
    public void settleOrder(UUID orderId, UUID restaurantId, BigDecimal total,
                            BigDecimal goods, BigDecimal serviceFee, BigDecimal deliveryFee,
                            UUID courierId, BigDecimal cashCollected) {
        try {
            Map<String, Object> body = new java.util.HashMap<>();
            body.put("orderId", orderId.toString());
            body.put("restaurantId", restaurantId.toString());
            body.put("orderTotal", total);
            body.put("goods", goods);
            body.put("serviceFee", serviceFee);
            body.put("deliveryFee", deliveryFee);
            if (courierId != null) body.put("courierId", courierId.toString());
            if (cashCollected != null) body.put("cashCollected", cashCollected);

            webClient.post()
                .uri("/wallet/settle/" + orderId)
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Internal-Key", internalKey)
                .bodyValue(body)
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(5))
                .block();
            log.info("[WALLET-CLIENT] order settled orderId={}", orderId);
        } catch (Exception e) {
            log.error("[WALLET-CLIENT] settleOrder failed orderId={}: {}", orderId, e.getMessage());
        }
    }
}
