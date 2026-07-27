package com.gozone.wallet.service;

import com.gozone.wallet.model.*;
import com.gozone.wallet.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class WalletService {

    private static final Logger log = LoggerFactory.getLogger(WalletService.class);

    /** A payout is "open" until an admin (or the provider) settles it either way. */
    private static final List<String> OPEN_STATUSES = List.of("PENDING", "PROCESSING");

    /** GoZone's own wallet — commission and service fees land here. */
    private static final UUID PLATFORM_WALLET = UUID.fromString("00000000-0000-0000-0000-000000000001");

    private final WalletRepository walletRepo;
    private final LedgerEntryRepository ledgerRepo;
    private final CommissionConfigRepository commissionRepo;
    private final WithdrawalRepository withdrawalRepo;
    private final NotificationService notificationService;
    private final PaystackService paystackService;
    private final PaymentAuthorizationRepository cardRepo;

    /** Floor for a cash out — keeps payout fees from swallowing the transfer. */
    @Value("${app.payout.min-amount:10.00}")
    private BigDecimal minWithdrawal;

    public WalletService(WalletRepository walletRepo,
                         LedgerEntryRepository ledgerRepo,
                         CommissionConfigRepository commissionRepo,
                         WithdrawalRepository withdrawalRepo,
                         NotificationService notificationService,
                         PaystackService paystackService,
                         PaymentAuthorizationRepository cardRepo) {
        this.walletRepo       = walletRepo;
        this.ledgerRepo       = ledgerRepo;
        this.commissionRepo   = commissionRepo;
        this.withdrawalRepo   = withdrawalRepo;
        this.notificationService = notificationService;
        this.paystackService  = paystackService;
        this.cardRepo         = cardRepo;
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
        return topUp(userId, amount, reference, "RIDER");
    }

    /**
     * Credit a top-up to a specific wallet. Couriers pay into their DRIVER wallet to clear cash
     * they owe GoZone; customers top up their RIDER wallet to spend.
     */
    public BigDecimal topUp(UUID userId, BigDecimal amount, String reference, String ownerType) {
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
        Wallet wallet = ensureWallet(userId, ownerType == null || ownerType.isBlank() ? "RIDER" : ownerType.trim().toUpperCase());
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

    // ── Saved cards ──────────────────────────────────────────────────────────────

    /**
     * Remember the card behind a successful payment, so the next one is a single tap.
     *
     * <p>Called after any verified Paystack payment. Silent by design: saving a card is a
     * convenience the customer did not ask for on this journey, so nothing here may fail their
     * payment. Cards only — Paystack does not make mobile-money authorizations reusable.
     */
    public void rememberCard(UUID userId, String reference, BigDecimal amount) {
        try {
            PaystackService.CardAuthorization auth = paystackService.verifyAndExtractCard(reference, amount);
            if (auth == null) return;
            // Same card paying again comes back with the same signature — update rather than
            // stacking a third identical "Visa ••1234" in the customer's list.
            PaymentAuthorization card = (auth.signature() == null ? Optional.<PaymentAuthorization>empty()
                : cardRepo.findByUserIdAndSignature(userId, auth.signature())).orElseGet(PaymentAuthorization::new);
            card.setUserId(userId);
            card.setAuthorizationCode(auth.code());
            card.setSignature(auth.signature());
            card.setLast4(auth.last4());
            card.setBrand(auth.brand());
            card.setBank(auth.bank());
            card.setExpMonth(auth.expMonth());
            card.setExpYear(auth.expYear());
            card.setEmail(auth.email());
            cardRepo.save(card);
            log.info("[CARD] saved for userId={} brand={} last4={}", userId, auth.brand(), auth.last4());
        } catch (Exception e) {
            log.warn("[CARD] could not save the card for userId={}: {}", userId, e.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public List<PaymentAuthorization> listCards(UUID userId) {
        return cardRepo.findByUserIdOrderByCreatedAtDesc(userId);
    }

    public void deleteCard(UUID userId, UUID cardId) {
        PaymentAuthorization card = cardRepo.findByIdAndUserId(cardId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Card not found"));
        cardRepo.delete(card);
    }

    /**
     * Charge a saved card and hand back the reference.
     *
     * <p>The reference is the join to everything that already exists: the caller passes it to
     * /wallet/topup/verify, or to the ride/food pay endpoint, which verify it server-side exactly
     * as they verify a checkout payment. So a one-tap card payment reuses the same proven path
     * instead of getting a second, less-tested one of its own.
     */
    public String chargeSavedCard(UUID userId, UUID cardId, BigDecimal amount) {
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Amount must be greater than 0");
        }
        PaymentAuthorization card = cardRepo.findByIdAndUserId(cardId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Card not found"));

        PaystackService.ChargeResult res =
            paystackService.chargeAuthorization(card.getAuthorizationCode(), card.getEmail(), amount);
        if (!res.success()) {
            // 402: the request was fine, the card refused. The app offers checkout as the way out.
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                res.failureReason() != null ? res.failureReason() : "The card was declined.");
        }
        log.info("[CARD] charged userId={} amount={} ref={}", userId, amount, res.reference());
        return res.reference();
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

    // ── Paying with the GoZone wallet ────────────────────────────────────────────

    /**
     * Take money out of a customer's wallet to pay for a ride or an order.
     *
     * <p>This is the step that was missing: "pay with wallet" used to mark the ride or order
     * paid without touching any balance, so an empty wallet paid fine and the driver/vendor was
     * still credited — money out of nothing. A wallet payment now fails loudly when the balance
     * won't cover it, and the caller must not mark anything paid.
     *
     * <p>Idempotent on the ride/order id, so a retried call after a timeout can't charge twice.
     *
     * @return the customer's balance after the charge
     */
    public BigDecimal charge(UUID userId, BigDecimal amount, UUID refId, String refType) {
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid amount");
        }
        Wallet wallet = ensureWallet(userId, "RIDER");

        if (refId != null && ledgerRepo.existsByRefIdAndType(refId, "PAYMENT")) {
            log.info("[WALLET] {} {} already charged — skipping", refType, refId);
            return wallet.getBalance();
        }
        if (wallet.getBalance().compareTo(amount) < 0) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                "Your GoZone wallet has GH₵ " + wallet.getBalance().toPlainString()
                    + " — top up or choose another payment method.");
        }

        debit(wallet, amount, "PAYMENT", refId, refType);
        log.info("[WALLET] charged user={} amount={} for {} {}", userId, amount, refType, refId);
        return wallet.getBalance();
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
        Wallet platformWallet = ensureWallet(PLATFORM_WALLET, "PLATFORM");
        credit(platformWallet, commission, "COMMISSION_DEBIT", tripId, "TRIP");

        log.info("[WALLET] ride settled tripId={} fare={} commission={} driverNet={}",
            tripId, agreedFare, commission, driverNet);
    }

    /**
     * Settle a completed food order — a three-way split, not a single credit.
     *
     * <p>The customer's total is <em>goods + service fee + delivery fee</em>, and each part
     * belongs to someone different:
     * <ul>
     *   <li><b>vendor</b> — the goods, less GoZone's commission. Not the delivery fee: that was
     *       never theirs (they used to be credited the whole total, so they pocketed the
     *       customer's delivery fee and the courier got nothing).</li>
     *   <li><b>courier</b> — the delivery fee, for the leg they actually rode. Nobody on a
     *       pickup or walk-in order, so there is no courier to pay.</li>
     *   <li><b>platform</b> — commission on the goods, plus the service fee.</li>
     * </ul>
     *
     * <p><b>Cash orders.</b> The courier is handed the money at the door and keeps it, so on top
     * of the split we debit them everything they collected. Their balance goes negative by
     * exactly what they owe GoZone, which they clear by topping up — the model Bolt and DoorDash
     * use. The vendor is paid either way and never carries the risk of a courier not paying in.
     *
     * @param goods       order subtotal after any discount (what the food actually cost)
     * @param serviceFee  GoZone's platform fee, already included in the customer's total
     * @param deliveryFee the courier's fee, already included in the customer's total
     * @param courierId   the assigned courier, or null for pickup/walk-in
     * @param cashCollected total the courier physically took at the door, or null if prepaid
     */
    public void settleOrder(UUID orderId, UUID restaurantId, BigDecimal orderTotal,
                            BigDecimal goods, BigDecimal serviceFee, BigDecimal deliveryFee,
                            UUID courierId, BigDecimal cashCollected) {
        if (orderId != null && ledgerRepo.existsByRefIdAndType(orderId, "FARE_CREDIT")) {
            log.info("[WALLET] order already settled orderId={} — skipping", orderId);
            return;
        }
        BigDecimal commissionRate = commissionRepo.findById("FOOD")
            .map(CommissionConfig::getRate)
            .orElse(new BigDecimal("0.12"));

        // Fall back to the old whole-total behaviour only if the caller didn't break the order
        // down — keeps a mid-deploy call from crediting nobody.
        BigDecimal goodsAmount = goods != null ? goods : orderTotal;
        BigDecimal service     = serviceFee != null ? serviceFee : BigDecimal.ZERO;
        BigDecimal delivery    = deliveryFee != null ? deliveryFee : BigDecimal.ZERO;

        BigDecimal commission  = goodsAmount.multiply(commissionRate).setScale(2, RoundingMode.HALF_UP);
        BigDecimal vendorNet   = goodsAmount.subtract(commission);

        Wallet restaurantWallet = ensureWallet(restaurantId, "RESTAURANT");
        credit(restaurantWallet, vendorNet, "FARE_CREDIT", orderId, "ORDER");

        if (courierId != null && delivery.signum() > 0) {
            Wallet courierWallet = ensureWallet(courierId, "DRIVER");
            credit(courierWallet, delivery, "DELIVERY_FEE", orderId, "ORDER");
        }

        Wallet platformWallet = ensureWallet(PLATFORM_WALLET, "PLATFORM");
        credit(platformWallet, commission.add(service), "COMMISSION_DEBIT", orderId, "ORDER");

        // Cash: the courier is holding the customer's money. Everything above was credited as if
        // GoZone had been paid, so the courier now owes GoZone the cash in their pocket.
        if (cashCollected != null && cashCollected.signum() > 0 && courierId != null) {
            Wallet courierWallet = ensureWallet(courierId, "DRIVER");
            debit(courierWallet, cashCollected, "CASH_COLLECTED", orderId, "ORDER");
            log.info("[WALLET] courier {} owes {} cash from order {}", courierId, cashCollected, orderId);
        }

        log.info("[WALLET] order settled orderId={} goods={} commission={} vendorNet={} courier={} deliveryFee={}",
            orderId, goodsAmount, commission, vendorNet, courierId, delivery);
    }

    // ── Cash out (withdrawal) ────────────────────────────────────────────────────

    /**
     * Request a payout of earned money.
     *
     * The wallet is debited immediately, so the same balance can't be cashed out twice
     * while a payout is in flight. We then ask the provider to send the money: if it
     * accepts, the request goes PROCESSING; if there is no provider (or it refuses), the
     * request stays PENDING on the admin payout board to be paid by hand. Either way the
     * money has already left the earner's balance, and a FAILED payout refunds it.
     */
    public Withdrawal requestWithdrawal(UUID ownerId, String ownerType, BigDecimal amount,
                                        String method, String accountName, String accountNumber,
                                        String provider) {
        String type = normalizeMethod(method);
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter an amount greater than 0.");
        }
        amount = amount.setScale(2, RoundingMode.HALF_UP);
        if (amount.compareTo(minWithdrawal) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "The smallest cash out is GH₵ " + minWithdrawal.toPlainString() + ".");
        }
        if (isBlank(accountName) || isBlank(accountNumber) || isBlank(provider)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Enter the account name, number and provider to pay into.");
        }
        if (withdrawalRepo.existsByOwnerIdAndOwnerTypeAndStatusIn(ownerId, ownerType, OPEN_STATUSES)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "You already have a cash out in progress. It has to complete first.");
        }

        Wallet wallet = ensureWallet(ownerId, ownerType);
        if (wallet.getBalance().signum() < 0) {
            // Cash they've collected and not yet paid in. "More than your balance" would read
            // as a maths error here, so name the debt.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "You owe GoZone GH₵ " + wallet.getBalance().abs().toPlainString()
                    + " from cash collected. Pay it in before cashing out.");
        }
        if (wallet.getBalance().compareTo(amount) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "That's more than your balance of GH₵ " + wallet.getBalance().toPlainString() + ".");
        }

        Withdrawal w = new Withdrawal();
        w.setOwnerId(ownerId);
        w.setOwnerType(ownerType);
        w.setAmount(amount);
        w.setMethod(type);
        w.setAccountName(accountName.trim());
        w.setAccountNumber(accountNumber.trim());
        w.setProvider(provider.trim().toUpperCase());
        w.setStatus("PENDING");
        withdrawalRepo.save(w);

        // Hold the money now — the ledger entry carries the withdrawal id so the refund
        // path (and the app's history) can tie back to this exact request.
        debit(wallet, amount, "PAYOUT", w.getId(), "WITHDRAWAL");

        PaystackService.TransferResult result = paystackService.transfer(
            w.getAccountName(), w.getAccountNumber(), w.getProvider(),
            "MOMO".equals(type), amount, "GoZone payout");

        if (result.accepted()) {
            w.setStatus("PROCESSING");
            w.setProviderRef(result.reference());
        } else {
            w.setFailureReason(result.failureReason()); // why it's queued, not why it failed
        }
        withdrawalRepo.save(w);

        log.info("[WALLET] withdrawal requested id={} owner={} type={} amount={} status={}",
            w.getId(), ownerId, ownerType, amount, w.getStatus());
        return w;
    }

    @Transactional(readOnly = true)
    public List<Withdrawal> getWithdrawals(UUID ownerId, String ownerType) {
        return withdrawalRepo.findByOwnerIdAndOwnerTypeOrderByCreatedAtDesc(ownerId, ownerType);
    }

    /** Admin payout board: everything still owed (oldest first), or the recent history. */
    @Transactional(readOnly = true)
    public List<Withdrawal> listWithdrawals(boolean openOnly) {
        return openOnly
            ? withdrawalRepo.findByStatusInOrderByCreatedAtAsc(OPEN_STATUSES)
            : withdrawalRepo.findTop100ByOrderByCreatedAtDesc();
    }

    /**
     * Admin marks a payout paid or failed. PAID is terminal and keeps the debit; FAILED
     * refunds the held money (once — the ledger guard makes a repeat call a no-op).
     */
    public Withdrawal reviewWithdrawal(UUID withdrawalId, String status, String reason) {
        Withdrawal w = withdrawalRepo.findById(withdrawalId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Withdrawal not found"));
        String next = status == null ? "" : status.trim().toUpperCase();
        if (!next.equals("PAID") && !next.equals("FAILED")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status must be PAID or FAILED.");
        }
        if (!OPEN_STATUSES.contains(w.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "This payout is already " + w.getStatus().toLowerCase() + ".");
        }

        if (next.equals("FAILED")) {
            if (!ledgerRepo.existsByRefIdAndType(w.getId(), "REFUND")) {
                Wallet wallet = ensureWallet(w.getOwnerId(), w.getOwnerType());
                credit(wallet, w.getAmount(), "REFUND", w.getId(), "WITHDRAWAL");
            }
            w.setFailureReason(isBlank(reason) ? "Payout could not be completed" : reason.trim());
        } else {
            w.setFailureReason(null);
        }
        w.setStatus(next);
        w.setCompletedAt(OffsetDateTime.now());
        withdrawalRepo.save(w);

        notificationService.send(w.getOwnerId(),
            next.equals("PAID") ? "Cash out sent" : "Cash out failed",
            next.equals("PAID")
                ? "GH₵ " + w.getAmount().toPlainString() + " is on its way to your "
                    + ("MOMO".equals(w.getMethod()) ? "mobile money." : "bank account.")
                : "We couldn't complete your GH₵ " + w.getAmount().toPlainString()
                    + " cash out, so it's back in your wallet.");

        log.info("[WALLET] withdrawal {} -> {}", withdrawalId, next);
        return w;
    }

    private static String normalizeMethod(String method) {
        String m = method == null ? "" : method.trim().toUpperCase();
        if (!m.equals("MOMO") && !m.equals("BANK")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose mobile money or a bank account.");
        }
        return m;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /**
     * Mock courier payout from platform wallet.
     */
    public void payoutCourier(UUID courierId, BigDecimal amount) {
        Wallet courierWallet = ensureWallet(courierId, "DRIVER");
        credit(courierWallet, amount, "PAYOUT", null, null);

        Wallet platformWallet = ensureWallet(PLATFORM_WALLET, "PLATFORM");
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
