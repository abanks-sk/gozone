package com.gozone.wallet.model;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A card Paystack has authorised us to charge again without the customer re-entering anything.
 *
 * <p>Holds an authorization code, not a card. The code is only usable by this Paystack account,
 * against the email it was created with — so it is worth nothing to anyone who steals it, unlike
 * the card number the app used to keep. See V3__saved_cards.sql.
 */
@Entity
@Table(name = "payment_authorizations")
public class PaymentAuthorization {

    @Id
    private UUID id = UUID.randomUUID();

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "authorization_code", nullable = false)
    private String authorizationCode;

    /** Paystack's fingerprint for the card — how we recognise a card we have already saved. */
    private String signature;

    private String last4;
    private String brand;
    private String bank;

    @Column(name = "exp_month")
    private String expMonth;

    @Column(name = "exp_year")
    private String expYear;

    @Column(nullable = false)
    private String email;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getAuthorizationCode() { return authorizationCode; }
    public void setAuthorizationCode(String c) { this.authorizationCode = c; }
    public String getSignature() { return signature; }
    public void setSignature(String s) { this.signature = s; }
    public String getLast4() { return last4; }
    public void setLast4(String l) { this.last4 = l; }
    public String getBrand() { return brand; }
    public void setBrand(String b) { this.brand = b; }
    public String getBank() { return bank; }
    public void setBank(String b) { this.bank = b; }
    public String getExpMonth() { return expMonth; }
    public void setExpMonth(String m) { this.expMonth = m; }
    public String getExpYear() { return expYear; }
    public void setExpYear(String y) { this.expYear = y; }
    public String getEmail() { return email; }
    public void setEmail(String e) { this.email = e; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant t) { this.createdAt = t; }
}
