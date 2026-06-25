package com.gozone.wallet.controller;

import com.gozone.wallet.dto.PushTokenRequest;
import com.gozone.wallet.dto.SettleOrderRequest;
import com.gozone.wallet.dto.SettleRideRequest;
import com.gozone.wallet.model.LedgerEntry;
import com.gozone.wallet.service.NotificationService;
import com.gozone.wallet.service.WalletService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

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

    public WalletController(WalletService walletService, NotificationService notificationService) {
        this.walletService       = walletService;
        this.notificationService = notificationService;
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

    // ── Internal settlement calls (from ride-service / food-service) ───────────

    @PostMapping("/commission")
    public ResponseEntity<Map<String, String>> settleRide(
            @Valid @RequestBody SettleRideRequest req) {
        walletService.settleRide(req.getTripId(), req.getDriverId(), req.getAgreedFare());
        return ResponseEntity.ok(Map.of("status", "settled", "pillar", "RIDE"));
    }

    @PostMapping("/settle/{orderId}")
    public ResponseEntity<Map<String, String>> settleOrder(
            @PathVariable UUID orderId,
            @Valid @RequestBody SettleOrderRequest req) {
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
