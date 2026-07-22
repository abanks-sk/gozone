package com.gozone.wallet.service;

import com.gozone.wallet.model.*;
import com.gozone.wallet.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
public class WalletService {

    private static final Logger log = LoggerFactory.getLogger(WalletService.class);

    private final WalletRepository walletRepo;
    private final LedgerEntryRepository ledgerRepo;
    private final CommissionConfigRepository commissionRepo;
    private final NotificationService notificationService;
    private final PaystackService paystackService;

    public WalletService(WalletRepository walletRepo,
                         LedgerEntryRepository ledgerRepo,
                         CommissionConfigRepository commissionRepo,
                         NotificationService notificationService,
                         PaystackService paystackService) {
        this.walletRepo       = walletRepo;
        this.ledgerRepo       = ledgerRepo;
        this.commissionRepo   = commissionRepo;
        this.notificationService = notificationService;
        this.paystackService  = paystackService;
    }

    // ── Wallet funding (Paystack top-up) ─────────────────────────────────────────

    /** Start a Paystack top-up; returns {reference, authorizationUrl} for the app to open. */
    @Transactional(readOnly = true)
    public Map<String, String> initializeTopUp(BigDecimal amount, String email) {
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Top-up amount must be greater than 0");
        }
        String payerEmail = (email != null && !email.isBlank()) ? email.trim() : "customer@gozone.app";
        return paystackService.initialize(payerEmail, amount);
    }

    /**
     * Verify a Paystack transaction and, if valid, credit the customer's RIDER wallet.
     * Idempotent per reference — tapping "verify" twice never double-credits.
     * Returns the resulting balance.
     */
    public BigDecimal topUp(UUID userId, BigDecimal amount, String reference) {
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Top-up amount must be greater than 0");
        }
        if (reference == null || reference.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing payment reference");
        }
        if (!paystackService.verify(reference, amount)) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                "Payment could not be verified. If you completed it, please try Verify again.");
        }

        // Deterministic ref id from the Paystack reference → reuse existing idempotency guard.
        UUID refId = UUID.nameUUIDFromBytes(("TOPUP:" + reference).getBytes(StandardCharsets.UTF_8));
        Wallet wallet = ensureWallet(userId, "RIDER");
        if (ledgerRepo.existsByRefIdAndType(refId, "TOP_UP")) {
            log.info("[WALLET] top-up already applied ref={} — skipping", reference);
            return wallet.getBalance();
        }

        credit(wallet, amount, "TOP_UP", refId, "PAYSTACK");
        log.info("[WALLET] top-up userId={} amount={} ref={}", userId, amount, reference);
        return wallet.getBalance();
    }

    // ── Generic Paystack payment (ride/food card & mobile-money payments) ─────────

    /** Start a Paystack payment for an arbitrary amount; returns {reference, authorizationUrl}. */
    @Transactional(readOnly = true)
    public Map<String, String> initializePayment(BigDecimal amount, String email) {
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Amount must be greater than 0");
        }
        String payerEmail = (email != null && !email.isBlank()) ? email.trim() : "customer@gozone.app";
        return paystackService.initialize(payerEmail, amount);
    }

    /** Confirm a Paystack payment covered the amount. Called service-to-service by ride/food. */
    @Transactional(readOnly = true)
    public boolean verifyPayment(String reference, BigDecimal amount) {
        if (reference == null || reference.isBlank() || amount == null) return false;
        return paystackService.verify(reference, amount);
    }

    /** Get or create a wallet for an owner. */
    public Wallet ensureWallet(UUID ownerId, String ownerType) {
        return walletRepo.findByOwnerIdAndOwnerType(ownerId, ownerType)
            .orElseGet(() -> {
                Wallet w = new Wallet();
                w.setOwnerId(ownerId);
                w.setOwnerType(ownerType);
                return walletRepo.save(w);
            });
    }

    /** Query balance. */
    @Transactional(readOnly = true)
    public BigDecimal getBalance(UUID ownerId, String ownerType) {
        return ensureWallet(ownerId, ownerType).getBalance();
    }

    /** Ledger history for an owner. */
    @Transactional(readOnly = true)
    public List<LedgerEntry> getLedger(UUID ownerId, String ownerType) {
        Wallet wallet = walletRepo.findByOwnerIdAndOwnerType(ownerId, ownerType)
            .orElseThrow(() -> new IllegalStateException("Wallet not found"));
        return ledgerRepo.findByWalletIdOrderByCreatedAtDesc(wallet.getId());
    }

    /**
     * Settle a completed ride: credit driver net-of-commission, debit commission to platform.
     * Payments always succeed (mock ledger).
     */
    public void settleRide(UUID tripId, UUID driverId, BigDecimal agreedFare) {
        // Idempotent: a trip is only ever settled once (guards double-settlement/replay).
        if (tripId != null && ledgerRepo.existsByRefIdAndType(tripId, "FARE_CREDIT")) {
            log.info("[WALLET] ride already settled tripId={} — skipping", tripId);
            return;
        }
        BigDecimal commissionRate = commissionRepo.findById("RIDE")
            .map(CommissionConfig::getRate)
            .orElse(new BigDecimal("0.18"));

        BigDecimal commission = agreedFare.multiply(commissionRate).setScale(2, RoundingMode.HALF_UP);
        BigDecimal driverNet  = agreedFare.subtract(commission);

        // Credit driver
        Wallet driverWallet = ensureWallet(driverId, "DRIVER");
        credit(driverWallet, driverNet, "FARE_CREDIT", tripId, "TRIP");

        // Debit commission to platform wallet
        Wallet platformWallet = ensureWallet(UUID.fromString("00000000-0000-0000-0000-000000000001"), "PLATFORM");
        credit(platformWallet, commission, "COMMISSION_DEBIT", tripId, "TRIP");

        log.info("[WALLET] ride settled tripId={} fare={} commission={} driverNet={}",
            tripId, agreedFare, commission, driverNet);
    }

    /**
     * Settle a completed food order: credit restaurant net-of-commission, debit commission to platform.
     */
    public void settleOrder(UUID orderId, UUID restaurantId, BigDecimal orderTotal) {
        if (orderId != null && ledgerRepo.existsByRefIdAndType(orderId, "FARE_CREDIT")) {
            log.info("[WALLET] order already settled orderId={} — skipping", orderId);
            return;
        }
        BigDecimal commissionRate = commissionRepo.findById("FOOD")
            .map(CommissionConfig::getRate)
            .orElse(new BigDecimal("0.12"));

        BigDecimal commission    = orderTotal.multiply(commissionRate).setScale(2, RoundingMode.HALF_UP);
        BigDecimal restaurantNet = orderTotal.subtract(commission);

        Wallet restaurantWallet = ensureWallet(restaurantId, "RESTAURANT");
        credit(restaurantWallet, restaurantNet, "FARE_CREDIT", orderId, "ORDER");

        Wallet platformWallet = ensureWallet(UUID.fromString("00000000-0000-0000-0000-000000000001"), "PLATFORM");
        credit(platformWallet, commission, "COMMISSION_DEBIT", orderId, "ORDER");

        log.info("[WALLET] order settled orderId={} total={} commission={} restaurantNet={}",
            orderId, orderTotal, commission, restaurantNet);
    }

    /**
     * Mock courier payout from platform wallet.
     */
    public void payoutCourier(UUID courierId, BigDecimal amount) {
        Wallet courierWallet = ensureWallet(courierId, "DRIVER");
        credit(courierWallet, amount, "PAYOUT", null, null);

        Wallet platformWallet = ensureWallet(UUID.fromString("00000000-0000-0000-0000-000000000001"), "PLATFORM");
        debit(platformWallet, amount, "PAYOUT", null, null);

        log.info("[WALLET] courier payout courierId={} amount={}", courierId, amount);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private void credit(Wallet wallet, BigDecimal amount, String type, UUID refId, String refType) {
        wallet.setBalance(wallet.getBalance().add(amount));
        walletRepo.save(wallet);
        writeLedger(wallet, amount, type, refId, refType);
    }

    private void debit(Wallet wallet, BigDecimal amount, String type, UUID refId, String refType) {
        wallet.setBalance(wallet.getBalance().subtract(amount));
        walletRepo.save(wallet);
        writeLedger(wallet, amount.negate(), type, refId, refType);
    }

    private void writeLedger(Wallet wallet, BigDecimal amount, String type, UUID refId, String refType) {
        LedgerEntry entry = new LedgerEntry();
        entry.setWallet(wallet);
        entry.setAmount(amount);
        entry.setType(type);
        entry.setRefId(refId);
        entry.setRefType(refType);
        ledgerRepo.save(entry);
    }
}
