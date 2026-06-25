package com.gozone.wallet.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "ledger_entries")
public class LedgerEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "wallet_id", nullable = false)
    private Wallet wallet;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount; // positive = credit, negative = debit

    @Column(nullable = false, length = 30)
    private String type; // FARE_CREDIT | COMMISSION_DEBIT | PAYOUT | TOP_UP | REFUND

    @Column(name = "ref_id")
    private UUID refId; // tripId or orderId

    @Column(name = "ref_type", length = 20)
    private String refType; // TRIP | ORDER

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    public UUID getId() { return id; }
    public Wallet getWallet() { return wallet; }
    public void setWallet(Wallet wallet) { this.wallet = wallet; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public UUID getRefId() { return refId; }
    public void setRefId(UUID refId) { this.refId = refId; }
    public String getRefType() { return refType; }
    public void setRefType(String refType) { this.refType = refType; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
