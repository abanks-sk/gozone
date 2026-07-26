package com.gozone.wallet.controller;

import com.gozone.wallet.dto.PushTokenRequest;
import com.gozone.wallet.dto.SettleOrderRequest;
import com.gozone.wallet.dto.SettleRideRequest;
import com.gozone.wallet.dto.WithdrawalRequest;
import com.gozone.wallet.dto.WithdrawalResponse;
import com.gozone.wallet.model.LedgerEntry;
import com.gozone.wallet.service.NotificationService;
import com.gozone.wallet.service.WalletService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Wallet endpoints. Context-path is /wallet.
 */
@RestController
public class WalletController {

    private final WalletService walletService;
    private final NotificationService notificationService;

    /** Shared secret for internal service-to-service settlement calls (never sent to clients). */
    @Value("${app.internal.key}")
    private String internalKey;

    public WalletController(WalletService walletService, NotificationService notificationService) {
        this.walletService       = walletService;
        this.notificationService = notificationService;
    }

    private void requireInternal(String key) {
        // Fail closed: a missing/blank configured key never authorises a caller.
        if (internalKey == null || internalKey.isBlank() || key == null || !key.equals(internalKey)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Internal settlement only");
        }
    }

    // ── Balance ────────────────────────────────────────────────────────────────

    @GetMapping("/balance")
    public ResponseEntity<Map<String, Object>> balance(
            @AuthenticationPrincipal String userId,
            @RequestParam(defaultValue = "RIDER") String ownerType) {
        BigDecimal bal = walletService.getBalance(UUID.fromString(userId), ownerType);
        return ResponseEntity.ok(Map.of("balance", bal, "ownerType", ownerType));
    }

    @GetMapping("/ledger")
    public ResponseEntity<List<LedgerEntry>> ledger(
            @AuthenticationPrincipal String userId,
            @RequestParam(defaultValue = "RIDER") String ownerType) {
        return ResponseEntity.ok(walletService.getLedger(UUID.fromString(userId), ownerType));
    }

    // ── Wallet funding (Paystack top-up) ───────────────────────────────────────

    /** Start a top-up: returns { reference, authorizationUrl } for the app to open. */
    @PostMapping("/topup/initialize")
    public ResponseEntity<Map<String, String>> initializeTopUp(
            @AuthenticationPrincipal String userId,
            @RequestBody Map<String, Object> body) {
        BigDecimal amount = parseAmount(body.get("amount"));
        String email = body.get("email") != null ? String.valueOf(body.get("email")) : null;
        return ResponseEntity.ok(walletService.initializeTopUp(amount, email));
    }

    /** Verify the payment and credit the wallet; returns the new balance. */
    @PostMapping("/topup/verify")
    public ResponseEntity<Map<String, Object>> verifyTopUp(
            @AuthenticationPrincipal String userId,
            @RequestBody Map<String, Object> body) {
        BigDecimal amount = parseAmount(body.get("amount"));
        String reference = body.get("reference") != null ? String.valueOf(body.get("reference")) : null;
        BigDecimal balance = walletService.topUp(UUID.fromString(userId), amount, reference);
        return ResponseEntity.ok(Map.of("balance", balance, "status", "credited"));
    }

    /** Start a Paystack payment (ride/food card & momo) — returns { reference, authorizationUrl }. */
    @PostMapping("/pay/initialize")
    public ResponseEntity<Map<String, String>> initializePayment(
            @AuthenticationPrincipal String userId,
            @RequestBody Map<String, Object> body) {
        BigDecimal amount = parseAmount(body.get("amount"));
        String email = body.get("email") != null ? String.valueOf(body.get("email")) : null;
        return ResponseEntity.ok(walletService.initializePayment(amount, email));
    }

    /** Internal: confirm a Paystack reference covered the amount (called by ride/food services). */
    @PostMapping("/pay/verify")
    public ResponseEntity<Map<String, Object>> verifyPayment(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestBody Map<String, Object> body) {
        requireInternal(key);
        BigDecimal amount = parseAmount(body.get("amount"));
        String reference = body.get("reference") != null ? String.valueOf(body.get("reference")) : null;
        return ResponseEntity.ok(Map.of("verified", walletService.verifyPayment(reference, amount)));
    }

    // ── Cash out (withdrawals) ─────────────────────────────────────────────────

    /**
     * Request a payout of earned money. Only an approved driver/courier or vendor can —
     * the money debits their own wallet, so the caller's id is taken from the token, never
     * the body.
     */
    @PostMapping("/withdrawals")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER','RESTAURANT_OWNER') and hasAuthority('STATUS_ACTIVE')")
    public ResponseEntity<WithdrawalResponse> requestWithdrawal(
            @AuthenticationPrincipal String userId,
            @Valid @RequestBody WithdrawalRequest req) {
        String ownerType = req.getOwnerType() != null && !req.getOwnerType().isBlank()
            ? req.getOwnerType().trim().toUpperCase()
            : "DRIVER";
        return ResponseEntity.ok(WithdrawalResponse.from(walletService.requestWithdrawal(
            UUID.fromString(userId), ownerType, req.getAmount(), req.getMethod(),
            req.getAccountName(), req.getAccountNumber(), req.getProvider())));
    }

    /** Your own cash-out history (newest first). */
    @GetMapping("/withdrawals")
    public ResponseEntity<List<WithdrawalResponse>> myWithdrawals(
            @AuthenticationPrincipal String userId,
            @RequestParam(defaultValue = "DRIVER") String ownerType) {
        return ResponseEntity.ok(walletService
            .getWithdrawals(UUID.fromString(userId), ownerType.trim().toUpperCase())
            .stream().map(WithdrawalResponse::from).toList());
    }

    /** Admin payout board: `open=true` (default) lists what's still owed, oldest first. */
    @GetMapping("/withdrawals/all")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<List<WithdrawalResponse>> allWithdrawals(
            @RequestParam(defaultValue = "true") boolean open) {
        return ResponseEntity.ok(walletService.listWithdrawals(open)
            .stream().map(WithdrawalResponse::from).toList());
    }

    /** Admin marks a payout PAID (money sent) or FAILED (refunds the held amount). */
    @PatchMapping("/withdrawals/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<WithdrawalResponse> reviewWithdrawal(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(WithdrawalResponse.from(walletService.reviewWithdrawal(
            id, body.getOrDefault("status", ""), body.get("reason"))));
    }

    private static BigDecimal parseAmount(Object raw) {
        try {
            return new BigDecimal(String.valueOf(raw));
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid amount");
        }
    }

    // ── Internal settlement calls (from ride-service / food-service) ───────────

    @PostMapping("/commission")
    public ResponseEntity<Map<String, String>> settleRide(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @Valid @RequestBody SettleRideRequest req) {
        requireInternal(key);
        walletService.settleRide(req.getTripId(), req.getDriverId(), req.getAgreedFare());
        return ResponseEntity.ok(Map.of("status", "settled", "pillar", "RIDE"));
    }

    @PostMapping("/settle/{orderId}")
    public ResponseEntity<Map<String, String>> settleOrder(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @PathVariable UUID orderId,
            @Valid @RequestBody SettleOrderRequest req) {
        requireInternal(key);
        walletService.settleOrder(req.getOrderId(), req.getRestaurantId(), req.getOrderTotal());
        return ResponseEntity.ok(Map.of("status", "settled", "pillar", "FOOD"));
    }

    // ── Push token registration ────────────────────────────────────────────────

    @PostMapping("/push-token")
    public ResponseEntity<Map<String, String>> registerToken(
            @AuthenticationPrincipal String userId,
            @Valid @RequestBody PushTokenRequest req) {
        notificationService.registerPushToken(UUID.fromString(userId), req.getToken());
        return ResponseEntity.ok(Map.of("status", "registered"));
    }

    @DeleteMapping("/push-token")
    public ResponseEntity<Void> deregisterToken(
            @AuthenticationPrincipal String userId,
            @Valid @RequestBody PushTokenRequest req) {
        notificationService.deregisterPushToken(UUID.fromString(userId), req.getToken());
        return ResponseEntity.noContent().build();
    }

    // ── Notification history ──────────────────────────────────────────────────

    @GetMapping("/notifications")
    public ResponseEntity<?> notifications(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(notificationService.getNotifications(UUID.fromString(userId)));
    }

    // ── Health / ping ─────────────────────────────────────────────────────────

    @GetMapping("/ping")
    public ResponseEntity<Map<String, Object>> ping(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(Map.of(
            "service", "wallet-service",
            "status", "ok",
            "ts", OffsetDateTime.now().toString()
        ));
    }
}
