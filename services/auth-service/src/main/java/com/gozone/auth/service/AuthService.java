package com.gozone.auth.service;

import com.gozone.auth.config.JwtProperties;
import com.gozone.auth.dto.*;
import com.gozone.auth.model.*;
import com.gozone.auth.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.UUID;

@Service
@Transactional
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository userRepo;
    private final OtpCodeRepository otpRepo;
    private final RefreshTokenRepository refreshRepo;
    private final DriverKycRepository kycRepo;
    private final JwtService jwtService;
    private final JwtProperties jwtProps;

    @Value("${app.otp.expiry-minutes:5}")
    private int otpExpiryMinutes;

    public AuthService(UserRepository userRepo,
                       OtpCodeRepository otpRepo,
                       RefreshTokenRepository refreshRepo,
                       DriverKycRepository kycRepo,
                       JwtService jwtService,
                       JwtProperties jwtProps) {
        this.userRepo    = userRepo;
        this.otpRepo     = otpRepo;
        this.refreshRepo = refreshRepo;
        this.kycRepo     = kycRepo;
        this.jwtService  = jwtService;
        this.jwtProps    = jwtProps;
    }

    /** Register phone+role, issue an OTP (logged — not sent via SMS in dev). */
    public RegisterResponse register(RegisterRequest req) {
        User.Role role;
        try {
            role = User.Role.valueOf(req.getRole().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown role: " + req.getRole());
        }

        if (!userRepo.existsByPhone(req.getPhone())) {
            User user = new User();
            user.setPhone(req.getPhone());
            user.setRole(role);
            userRepo.save(user);
        }

        String code = generateOtp();
        OtpCode otp = new OtpCode();
        otp.setPhone(req.getPhone());
        otp.setCode(code);
        otp.setExpiresAt(OffsetDateTime.now().plusMinutes(otpExpiryMinutes));
        otpRepo.save(otp);

        // Dev mock — OTP printed to console instead of being sent via SMS
        log.info("[OTP-MOCK] phone={} code={} expires_in={}m", req.getPhone(), code, otpExpiryMinutes);

        return new RegisterResponse(req.getPhone(), "OTP sent (see server logs in dev)");
    }

    /** Verify OTP; return access + refresh token pair. */
    public TokenResponse verifyOtp(VerifyOtpRequest req) {
        OtpCode otp = otpRepo
            .findTopByPhoneAndConsumedAtIsNullOrderByExpiresAtDesc(req.getPhone())
            .orElseThrow(() -> new IllegalStateException("No pending OTP for this phone"));

        if (!otp.isValid()) {
            throw new IllegalStateException("OTP has expired");
        }
        if (!otp.getCode().equals(req.getCode())) {
            throw new IllegalStateException("Invalid OTP");
        }

        otp.setConsumedAt(OffsetDateTime.now());
        otpRepo.save(otp);

        User user = userRepo.findByPhone(req.getPhone())
            .orElseThrow(() -> new IllegalStateException("User not found for phone " + req.getPhone()));

        String accessToken  = jwtService.generateAccessToken(user);
        String refreshToken = generateAndSaveRefreshToken(user);

        return new TokenResponse(accessToken, refreshToken, user.getRole().name());
    }

    /** Rotate refresh token; return a new access + refresh pair. */
    public TokenResponse refresh(RefreshRequest req) {
        String hash = sha256(req.getRefreshToken());
        RefreshToken rt = refreshRepo.findByTokenHash(hash)
            .orElseThrow(() -> new AccessDeniedException("Refresh token not found"));

        if (!rt.isValid()) {
            throw new AccessDeniedException("Refresh token expired or revoked");
        }

        rt.setRevoked(true);
        refreshRepo.save(rt);

        User user = rt.getUser();
        String accessToken  = jwtService.generateAccessToken(user);
        String newRefresh   = generateAndSaveRefreshToken(user);
        return new TokenResponse(accessToken, newRefresh, user.getRole().name());
    }

    /** Return current user profile. */
    @Transactional(readOnly = true)
    public UserResponse me(String userId) {
        User user = userRepo.findById(UUID.fromString(userId))
            .orElseThrow(() -> new IllegalStateException("User not found"));
        return new UserResponse(user.getId(), user.getPhone(), user.getRole().name(), user.getStatus().name());
    }

    /** Driver submits KYC document references. */
    public KycResponse submitKyc(String userId, KycSubmitRequest req) {
        User user = userRepo.findById(UUID.fromString(userId))
            .orElseThrow(() -> new IllegalStateException("User not found"));

        if (user.getRole() != User.Role.DRIVER) {
            throw new AccessDeniedException("Only DRIVER accounts can submit KYC");
        }

        DriverKyc kyc = new DriverKyc();
        kyc.setUser(user);
        kyc.setLicenceNo(req.getLicenceNo());
        kyc.setVehicleReg(req.getVehicleReg());
        kyc.setRoadworthyUrl(req.getRoadworthyUrl());
        kyc.setIdSelfieUrl(req.getIdSelfieUrl());
        kycRepo.save(kyc);

        return toKycResponse(kyc);
    }

    /** Admin approves or rejects a KYC submission. */
    public KycResponse reviewKyc(UUID kycId, String adminUserId, KycReviewRequest req) {
        DriverKyc kyc = kycRepo.findById(kycId)
            .orElseThrow(() -> new IllegalStateException("KYC record not found"));

        kyc.setStatus(DriverKyc.KycStatus.valueOf(req.getStatus().toUpperCase()));
        kyc.setReviewedBy(UUID.fromString(adminUserId));
        if (req.getExpiryDate() != null) {
            kyc.setExpiryDate(req.getExpiryDate());
        }
        kycRepo.save(kyc);

        log.info("[KYC] id={} status={} reviewed_by={}", kycId, kyc.getStatus(), adminUserId);
        return toKycResponse(kyc);
    }

    // ── private helpers ────────────────────────────────────────────────────────

    private String generateAndSaveRefreshToken(User user) {
        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        RefreshToken rt = new RefreshToken();
        rt.setUser(user);
        rt.setTokenHash(sha256(token));
        rt.setExpiresAt(OffsetDateTime.now().plusNanos(jwtProps.getRefreshExpiryMs() * 1_000_000L));
        refreshRepo.save(rt);
        return token;
    }

    private String generateOtp() {
        return String.format("%06d", new SecureRandom().nextInt(1_000_000));
    }

    private String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private KycResponse toKycResponse(DriverKyc kyc) {
        return new KycResponse(
            kyc.getId(),
            kyc.getUser().getId(),
            kyc.getStatus().name(),
            kyc.getLicenceNo(),
            kyc.getVehicleReg()
        );
    }
}
