package com.gozone.wallet.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * Paystack gateway: money in (top-ups, ride/food payments) and money out (payouts).
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

    /**
     * Bounded client. A bare {@code new RestTemplate()} has no connect or read timeout, so an
     * unresponsive Paystack would park the request thread — and, because these calls happen
     * inside a transaction, hold a database transaction open with it. The timeouts are what
     * make the fail-soft catches below reachable at all (the same trap that once hung sign-in
     * on a stalled SMS gateway).
     */
    private final RestTemplate rest = buildClient();

    private static RestTemplate buildClient() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout((int) Duration.ofSeconds(4).toMillis());
        f.setReadTimeout((int) Duration.ofSeconds(8).toMillis());
        return new RestTemplate(f);
    }

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
    public boolean isMockMode() {
        return isMock();
    }

    // ── Money out: transfers (cash out) ──────────────────────────────────────────

    /** Outcome of a payout attempt: whether it left GoZone, and the provider's reference. */
    public record TransferResult(boolean accepted, String reference, String failureReason) {}

    /**
     * Send money to a mobile-money or bank account. Two steps at Paystack: create a
     * transfer recipient, then initiate the transfer against it.
     *
     * <p>Automatic transfers only work when the Paystack business is enabled for them
     * (and funded). When they are not — or in mock mode — this returns "not accepted"
     * with the reason, and the payout waits on the admin payout board to be marked paid
     * by hand. That is the honest fallback: a queued payout, never a fake success.
     *
     * @param provider mobile-money network (MTN / VODAFONE / AIRTELTIGO) or the bank's name
     * @param momo     true for a mobile-money wallet, false for a bank account
     */
    public TransferResult transfer(String accountName, String accountNumber, String provider,
                                   boolean momo, BigDecimal amount, String reason) {
        if (isMock()) {
            return new TransferResult(false, null, "No payment provider configured — queued for manual payout");
        }
        // Paystack wants a bank *code*. We hold codes for the three mobile-money networks;
        // banks are captured as a free-text name (there are dozens, and the list is a
        // separate Paystack lookup), so bank payouts go to the manual payout board.
        String bankCode = momo ? momoCode(provider) : null;
        if (bankCode == null) {
            return new TransferResult(false, null, momo
                ? "Unknown mobile-money network — queued for manual payout"
                : "Bank payouts are sent by hand — queued for manual payout");
        }
        try {
            HttpHeaders h = new HttpHeaders();
            h.setBearerAuth(secretKey);
            h.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> recipientPayload = Map.of(
                "type", momo ? "mobile_money" : "nuban",
                "name", accountName,
                "account_number", accountNumber,
                "bank_code", bankCode,
                "currency", "GHS");

            ResponseEntity<Map> recipientResp = rest.exchange(
                "https://api.paystack.co/transferrecipient",
                HttpMethod.POST, new HttpEntity<>(recipientPayload, h), Map.class);

            Map<?, ?> recipientBody = recipientResp.getBody();
            if (recipientBody == null || !Boolean.TRUE.equals(recipientBody.get("status"))) {
                return new TransferResult(false, null, "Could not register the payout account");
            }
            String recipientCode = String.valueOf(((Map<?, ?>) recipientBody.get("data")).get("recipient_code"));

            Map<String, Object> transferPayload = Map.of(
                "source", "balance",
                "amount", amount.multiply(KOBO).longValueExact(),
                "recipient", recipientCode,
                "reason", reason);

            ResponseEntity<Map> transferResp = rest.exchange(
                "https://api.paystack.co/transfer",
                HttpMethod.POST, new HttpEntity<>(transferPayload, h), Map.class);

            Map<?, ?> transferBody = transferResp.getBody();
            if (transferBody != null && Boolean.TRUE.equals(transferBody.get("status"))) {
                Map<?, ?> data = (Map<?, ?>) transferBody.get("data");
                return new TransferResult(true, String.valueOf(data.get("transfer_code")), null);
            }
            String message = transferBody != null ? String.valueOf(transferBody.get("message")) : "Transfer refused";
            return new TransferResult(false, null, message);
        } catch (HttpStatusCodeException e) {
            // The common case on a new Paystack account: "You cannot initiate third party
            // payouts as a starter business". Pass their wording through so whoever works
            // the payout board knows exactly what to fix.
            log.error("[PAYSTACK] transfer refused: {}", e.getResponseBodyAsString());
            return new TransferResult(false, null, providerMessage(e.getResponseBodyAsString()));
        } catch (Exception e) {
            log.error("[PAYSTACK] transfer failed: {}", e.getMessage());
            return new TransferResult(false, null, "Transfer could not be started — queued for manual payout");
        }
    }

    /** Paystack's Ghana mobile-money codes, keyed by the network we store. */
    private static String momoCode(String provider) {
        if (provider == null) return null;
        return switch (provider.trim().toUpperCase()) {
            case "MTN" -> "MTN";
            case "VODAFONE", "TELECEL" -> "VOD";
            case "AIRTELTIGO", "AIRTEL", "TIGO" -> "ATL";
            default -> null;
        };
    }

    /** Pull Paystack's human-readable "message" out of an error body, if it has one. */
    private static String providerMessage(String body) {
        if (body == null) return "Transfer refused — queued for manual payout";
        int i = body.indexOf("\"message\":\"");
        if (i < 0) return "Transfer refused — queued for manual payout";
        int start = i + 11;
        int end = body.indexOf('"', start);
        if (end <= start) return "Transfer refused — queued for manual payout";
        return "Paystack: " + body.substring(start, end) + " — queued for manual payout";
    }

    /** What a verified transaction told us about the card that paid, if it can be reused. */
    public record CardAuthorization(String code, String signature, String last4, String brand,
                                    String bank, String expMonth, String expYear, String email) {}

    /**
     * Verify a transaction and, if it was paid by a reusable card, return its authorization.
     *
     * <p>This is the only moment Paystack ever hands over a reusable code — it comes back attached
     * to a successful charge, not from any "save a card" call. Which is why a saved card can only
     * ever be the by-product of a real payment, and why the app's old card form could never have
     * worked however it was wired up.
     */
    public CardAuthorization verifyAndExtractCard(String reference, BigDecimal expected) {
        if (isMock() || reference == null || reference.isBlank()) return null;
        try {
            HttpHeaders h = new HttpHeaders();
            h.setBearerAuth(secretKey);
            ResponseEntity<Map> resp = rest.exchange(
                "https://api.paystack.co/transaction/verify/" + reference,
                HttpMethod.GET, new HttpEntity<>(h), Map.class);
            Map<?, ?> body = resp.getBody();
            if (!resp.getStatusCode().is2xxSuccessful() || body == null || !Boolean.TRUE.equals(body.get("status"))) return null;
            Map<?, ?> data = (Map<?, ?>) body.get("data");
            if (data == null || !"success".equalsIgnoreCase(String.valueOf(data.get("status")))) return null;

            Map<?, ?> auth = (Map<?, ?>) data.get("authorization");
            if (auth == null) return null;
            // Only cards come back reusable. Mobile money authorizations are single-use, so momo
            // goes through checkout every time — there is nothing to store for it.
            if (!Boolean.TRUE.equals(auth.get("reusable"))) return null;
            String code = str(auth.get("authorization_code"));
            if (code == null) return null;

            Map<?, ?> customer = (Map<?, ?>) data.get("customer");
            String email = customer == null ? null : str(customer.get("email"));
            if (email == null) return null;

            return new CardAuthorization(code, str(auth.get("signature")), str(auth.get("last4")),
                str(auth.get("card_type")), str(auth.get("bank")),
                str(auth.get("exp_month")), str(auth.get("exp_year")), email);
        } catch (Exception e) {
            log.warn("[PAYSTACK] could not read the card authorization for {}: {}", reference, e.getMessage());
            return null;
        }
    }

    /** Result of charging a stored card: a reference the normal verify path can then confirm. */
    public record ChargeResult(boolean success, String reference, String failureReason) {}

    /**
     * Charge a stored authorization — the whole point of saving one. No browser, no re-entering
     * a card number: the customer taps once and the charge happens server-side.
     */
    public ChargeResult chargeAuthorization(String authorizationCode, String email, BigDecimal amount) {
        String reference = "GZ-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        if (isMock()) return new ChargeResult(true, reference, null);
        try {
            HttpHeaders h = new HttpHeaders();
            h.setBearerAuth(secretKey);
            h.setContentType(MediaType.APPLICATION_JSON);
            Map<String, Object> payload = Map.of(
                "authorization_code", authorizationCode,
                "email", email,
                "amount", amount.multiply(KOBO).longValueExact(),
                "reference", reference);
            ResponseEntity<Map> resp = rest.exchange("https://api.paystack.co/transaction/charge_authorization",
                HttpMethod.POST, new HttpEntity<>(payload, h), Map.class);
            Map<?, ?> body = resp.getBody();
            if (resp.getStatusCode().is2xxSuccessful() && body != null && Boolean.TRUE.equals(body.get("status"))) {
                Map<?, ?> data = (Map<?, ?>) body.get("data");
                String status = data == null ? null : String.valueOf(data.get("status"));
                if ("success".equalsIgnoreCase(status)) {
                    return new ChargeResult(true, str(data.get("reference")) != null ? str(data.get("reference")) : reference, null);
                }
                // A card can need the customer back (3-D Secure, insufficient funds, expired).
                // Say so plainly rather than pretending the payment worked.
                return new ChargeResult(false, reference,
                    data != null && data.get("gateway_response") != null
                        ? String.valueOf(data.get("gateway_response")) : "The card was declined.");
            }
            return new ChargeResult(false, reference, providerMessage(String.valueOf(body)));
        } catch (Exception e) {
            log.error("[PAYSTACK] charge_authorization failed: {}", e.getMessage());
            return new ChargeResult(false, reference, "Could not reach the payment provider.");
        }
    }

    private static String str(Object o) {
        return o == null || String.valueOf(o).isBlank() || "null".equals(String.valueOf(o)) ? null : String.valueOf(o);
    }

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
