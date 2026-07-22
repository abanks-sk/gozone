package com.gozone.wallet.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Paystack payment gateway for wallet top-ups.
 *
 * Runs in one of two modes, chosen by {@code app.paystack.secret-key}:
 *   - "mock" (default): no external calls. initialize() returns a URL to our own
 *     sandbox checkout page and verify() always succeeds — good for demos with no key.
 *   - a real Paystack secret key (sk_test_… / sk_live_…): calls the Paystack API.
 *
 * The key is read from an env var only — never hardcoded.
 */
@Service
public class PaystackService {

    private static final Logger log = LoggerFactory.getLogger(PaystackService.class);
    private static final BigDecimal KOBO = BigDecimal.valueOf(100);

    @Value("${app.paystack.secret-key:mock}")
    private String secretKey;

    private final RestTemplate rest = new RestTemplate();

    private boolean isMock() {
        return secretKey == null || secretKey.isBlank() || "mock".equalsIgnoreCase(secretKey);
    }

    /** Start a transaction; returns {reference, authorizationUrl}. */
    public Map<String, String> initialize(String email, BigDecimal amount) {
        String reference = "PSK_" + System.currentTimeMillis();

        if (isMock()) {
            // Relative path — the app prepends its gateway base URL before opening it.
            String url = "/wallet/mock-checkout?reference=" + reference
                + "&amount=" + amount.toPlainString();
            return Map.of("reference", reference, "authorizationUrl", url);
        }

        try {
            HttpHeaders h = new HttpHeaders();
            h.setBearerAuth(secretKey);
            h.setContentType(MediaType.APPLICATION_JSON);
            long amountKobo = amount.multiply(KOBO).longValueExact();
            Map<String, Object> payload = Map.of("email", email, "amount", amountKobo, "reference", reference);

            ResponseEntity<Map> resp = rest.exchange(
                "https://api.paystack.co/transaction/initialize",
                HttpMethod.POST, new HttpEntity<>(payload, h), Map.class);

            Map<?, ?> body = resp.getBody();
            if (resp.getStatusCode().is2xxSuccessful() && body != null && Boolean.TRUE.equals(body.get("status"))) {
                Map<?, ?> data = (Map<?, ?>) body.get("data");
                return Map.of(
                    "reference", String.valueOf(data.get("reference")),
                    "authorizationUrl", String.valueOf(data.get("authorization_url")));
            }
        } catch (Exception e) {
            log.error("[PAYSTACK] initialize failed: {}", e.getMessage());
        }
        throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Could not start the payment. Please try again.");
    }

    /**
     * Verify a completed transaction. In mock mode this always succeeds; in real mode
     * it confirms the transaction is "success" AND the amount paid covers what was expected.
     * (Note: unlike some samples, real mode never bypasses on a reference prefix.)
     */
    public boolean verify(String reference, BigDecimal expected) {
        if (isMock()) return true;
        if (reference == null || reference.isBlank()) return false;

        try {
            HttpHeaders h = new HttpHeaders();
            h.setBearerAuth(secretKey);
            ResponseEntity<Map> resp = rest.exchange(
                "https://api.paystack.co/transaction/verify/" + reference,
                HttpMethod.GET, new HttpEntity<>(h), Map.class);

            Map<?, ?> body = resp.getBody();
            if (resp.getStatusCode().is2xxSuccessful() && body != null && Boolean.TRUE.equals(body.get("status"))) {
                Map<?, ?> data = (Map<?, ?>) body.get("data");
                if (data != null && "success".equalsIgnoreCase(String.valueOf(data.get("status")))) {
                    long paidKobo = ((Number) data.get("amount")).longValue();
                    long expectedKobo = expected.multiply(KOBO).longValueExact();
                    return paidKobo >= expectedKobo;
                }
            }
        } catch (Exception e) {
            log.error("[PAYSTACK] verify failed for {}: {}", reference, e.getMessage());
        }
        return false;
    }
}
