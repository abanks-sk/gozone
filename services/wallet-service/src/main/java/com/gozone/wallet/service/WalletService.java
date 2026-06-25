package com.gozone.wallet.service;

import com.gozone.wallet.model.*;
import com.gozone.wallet.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class WalletService {

    private static final Logger log = LoggerFactory.getLogger(WalletService.class);

    private final WalletRepository walletRepo;
    private final LedgerEntryRepository ledgerRepo;
    private final CommissionConfigRepository commissionRepo;
    private final NotificationService notificationService;

    public WalletService(WalletRepository walletRepo,
                         LedgerEntryRepository ledgerRepo,
                         CommissionConfigRepository commissionRepo,
                         NotificationService notificationService) {
        this.walletRepo       = walletRepo;
        this.ledgerRepo       = ledgerRepo;
        this.commissionRepo   = commissionRepo;
        this.notificationService = notificationService;
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
