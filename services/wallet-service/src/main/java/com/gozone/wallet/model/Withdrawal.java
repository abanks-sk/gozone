package com.gozone.wallet.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A cash-out request: earned wallet money leaving GoZone for the earner's mobile-money
 * or bank account.
 *
 * The wallet is debited when the request is created, so the same balance can't be cashed
 * out twice while a payout is in flight; a FAILED payout refunds it.
 */
@Entity
@Table(name = "withdrawals")
public class Withdrawal {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "owner_type", nullable = false, length = 30)
    private String ownerType; // DRIVER | RESTAURANT

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 20)
    private String method; // MOMO | BANK

    @Column(name = "account_name", nullable = false, length = 120)
    private String accountName;

    @Column(name = "account_number", nullable = false, length = 40)
    private String accountNumber;

    /** Mobile-money network (MTN / VODAFONE / AIRTELTIGO) or the bank name. */
    @Column(nullable = false, length = 40)
    private String provider;

    @Column(nullable = false, length = 20)
    private String status; // PENDING | PROCESSING | PAID | FAILED

    @Column(name = "provider_ref", length = 120)
    private String providerRef;

    @Column(name = "failure_reason", length = 255)
    private String failureReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    public UUID getId() { return id; }
    public UUID getOwnerId() { return ownerId; }
    public void setOwnerId(UUID ownerId) { this.ownerId = ownerId; }
    public String getOwnerType() { return ownerType; }
    public void setOwnerType(String ownerType) { this.ownerType = ownerType; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }
    public String getAccountName() { return accountName; }
    public void setAccountName(String accountName) { this.accountName = accountName; }
    public String getAccountNumber() { return accountNumber; }
    public void setAccountNumber(String accountNumber) { this.accountNumber = accountNumber; }
    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getProviderRef() { return providerRef; }
    public void setProviderRef(String providerRef) { this.providerRef = providerRef; }
    public String getFailureReason() { return failureReason; }
    public void setFailureReason(String failureReason) { this.failureReason = failureReason; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
}
