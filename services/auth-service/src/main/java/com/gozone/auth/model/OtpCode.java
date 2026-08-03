package com.gozone.auth.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "otp_codes")
public class OtpCode {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /**
     * Which app's account this code signs in to.
     *
     * A number can belong to a passenger account and a driver account at once, so "the newest
     * unconsumed code for this phone" stopped identifying anybody on its own.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private User.App app;

    /** Either phone or email is set, matching how the OTP was requested. */
    @Column(length = 20)
    private String phone;

    @Column(length = 255)
    private String email;

    @Column(nullable = false, length = 10)
    private String code;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "consumed_at")
    private OffsetDateTime consumedAt;

    @Column(nullable = false)
    private int attempts = 0;

    public UUID getId() { return id; }
    public User.App getApp() { return app; }
    public void setApp(User.App app) { this.app = app; }
    public int getAttempts() { return attempts; }
    public void setAttempts(int attempts) { this.attempts = attempts; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(OffsetDateTime expiresAt) { this.expiresAt = expiresAt; }
    public OffsetDateTime getConsumedAt() { return consumedAt; }
    public void setConsumedAt(OffsetDateTime consumedAt) { this.consumedAt = consumedAt; }

    public boolean isValid() {
        return consumedAt == null && expiresAt.isAfter(OffsetDateTime.now());
    }
}
