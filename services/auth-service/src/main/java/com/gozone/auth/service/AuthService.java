package com.gozone.auth.service;

import com.gozone.auth.config.JwtProperties;
import com.gozone.auth.dto.*;
import com.gozone.auth.model.*;
import com.gozone.auth.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Map;
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
    private final EmailService emailService;
    private final SmsService smsService;
    private final GoogleTokenVerifier googleVerifier;

    @Value("${app.otp.expiry-minutes:5}")
    private int otpExpiryMinutes;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public AuthService(UserRepository userRepo,
                       OtpCodeRepository otpRepo,
                       RefreshTokenRepository refreshRepo,
                       DriverKycRepository kycRepo,
                       JwtService jwtService,
                       JwtProperties jwtProps,
                       EmailService emailService,
                       SmsService smsService,
                       GoogleTokenVerifier googleVerifier) {
        this.userRepo    = userRepo;
        this.otpRepo     = otpRepo;
        this.refreshRepo = refreshRepo;
        this.kycRepo     = kycRepo;
        this.jwtService  = jwtService;
        this.jwtProps    = jwtProps;
        this.emailService = emailService;
        this.smsService  = smsService;
        this.googleVerifier = googleVerifier;
    }

    /** Register phone+role, issue an OTP (logged — not sent via SMS in dev). */
    public RegisterResponse register(RegisterRequest req) {
        User.Role role;
        try {
            role = User.Role.valueOf(req.getRole().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown role: " + req.getRole());
        }

        String phone = requireValidGhanaPhone(normalizePhone(req.getPhone()));
        User.App app = appForSignup(req.getApp(), role);
        requireSelfSignupAllowed(app, role);

        // Sign-up only: a phone that already has an account **in this app** must log in, not
        // re-register (otherwise "Create account" with an existing number silently logs into that
        // account). The same number in a different app is somebody's separate account and no
        // obstacle at all — refusing it was what left a would-be driver waiting for a code that
        // was never sent.
        if (userRepo.existsByPhoneAndApp(phone, app)) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT, "An account with this number already exists. Please log in.");
        }

        // Username is chosen at sign-up and must be unique within the app.
        String username = req.getUsername() == null || req.getUsername().isBlank()
            ? null
            : requireAvailableUsername(req.getUsername(), null, app);

        User user = new User();
        user.setApp(app);
        user.setPhone(phone);
        user.setRole(role);
        if (username != null) {
            user.setUsername(username);
        }
        if (req.getName() != null && !req.getName().isBlank()) {
            user.setName(req.getName().trim());
        }
        // Drivers, couriers and vendors must be approved by an admin before they go live.
        boolean needsApproval = role == User.Role.DRIVER
            || role == User.Role.COURIER
            || role == User.Role.RESTAURANT_OWNER;
        user.setStatus(needsApproval ? User.Status.PENDING : User.Status.ACTIVE);
        if (role == User.Role.DRIVER || role == User.Role.COURIER) {
            user.setVehicleClass(parseVehicleClass(req.getVehicleClass())); // OKADA/CARGO now; car → admin sets tier
        }
        userRepo.save(user);

        issueOtp(phone, app);
        return new RegisterResponse(phone, "OTP sent (see server logs in dev)");
    }

    /**
     * Login (phone-only): issue an OTP only if this phone already has an account in the app that
     * is asking. Unlike {@link #register}, this never creates a user — an unknown number is a 404.
     *
     * Scoping to the app is what stops a passenger's number signing straight into the driver app,
     * which it previously did because the only check was whether the number existed anywhere.
     */
    public RegisterResponse login(LoginRequest req) {
        String phone = requireValidGhanaPhone(normalizePhone(req.getPhone()));
        User user = resolveByPhone(phone, req.getApp(), "No account found for this number. Please sign up.");
        issueOtp(phone, user.getApp());
        return new RegisterResponse(phone, "OTP sent (see server logs in dev)");
    }

    /** Email sign-up: create the account and issue an OTP to the email (logged in dev). */
    public RegisterResponse registerEmail(EmailRegisterRequest req) {
        User.Role role;
        try {
            role = User.Role.valueOf(req.getRole().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown role: " + req.getRole());
        }

        String email = normalizeEmail(req.getEmail());
        User.App app = appForSignup(req.getApp(), role);
        requireSelfSignupAllowed(app, role);

        if (userRepo.existsByEmailAndApp(email, app)) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT, "An account with this email already exists. Please log in.");
        }

        User user = new User();
        user.setApp(app);
        user.setEmail(email);
        user.setRole(role);
        if (req.getName() != null && !req.getName().isBlank()) {
            user.setName(req.getName().trim());
        }
        boolean needsApproval = role == User.Role.DRIVER
            || role == User.Role.COURIER
            || role == User.Role.RESTAURANT_OWNER;
        user.setStatus(needsApproval ? User.Status.PENDING : User.Status.ACTIVE);
        if (role == User.Role.DRIVER || role == User.Role.COURIER) {
            user.setVehicleClass(parseVehicleClass(req.getVehicleClass()));
        }
        userRepo.save(user);

        issueEmailOtp(email, app);
        return new RegisterResponse(email, "OTP sent (see server logs in dev)");
    }

    /** Email login: issue an OTP only if this email already has an account in the asking app. */
    public RegisterResponse loginEmail(EmailLoginRequest req) {
        String email = normalizeEmail(req.getEmail());
        User user = resolveByEmail(email, req.getApp(), "No account found for this email. Please sign up.");
        issueEmailOtp(email, user.getApp());
        return new RegisterResponse(email, "OTP sent (see server logs in dev)");
    }

    /** Verify OTP (by email if provided, else phone); return access + refresh token pair. */
    public TokenResponse verifyOtp(VerifyOtpRequest req) {
        boolean byEmail = req.getEmail() != null && !req.getEmail().isBlank();

        // The code carries the app it was issued for, so it identifies the account on its own —
        // which matters now that one number can have several. A client that names its app gets the
        // code for that app; one that does not is resolved from the newest pending code, since it
        // can only be holding a code that was actually sent to it.
        User.App asked = parseApp(req.getApp());

        OtpCode otp;
        User user;
        if (byEmail) {
            String email = normalizeEmail(req.getEmail());
            otp = (asked != null
                    ? otpRepo.findTopByEmailAndAppAndConsumedAtIsNullOrderByExpiresAtDesc(email, asked)
                    : otpRepo.findTopByEmailAndConsumedAtIsNullOrderByExpiresAtDesc(email))
                .orElseThrow(() -> new IllegalStateException("No pending OTP for this email"));
            user = userRepo.findByEmailAndApp(email, otp.getApp())
                .orElseThrow(() -> new IllegalStateException("User not found for email " + email));
        } else {
            String phone = normalizePhone(req.getPhone());
            otp = (asked != null
                    ? otpRepo.findTopByPhoneAndAppAndConsumedAtIsNullOrderByExpiresAtDesc(phone, asked)
                    : otpRepo.findTopByPhoneAndConsumedAtIsNullOrderByExpiresAtDesc(phone))
                .orElseThrow(() -> new IllegalStateException("No pending OTP for this phone"));
            user = userRepo.findByPhoneAndApp(phone, otp.getApp())
                .orElseThrow(() -> new IllegalStateException("User not found for phone " + phone));
        }

        if (!otp.isValid()) {
            throw new IllegalStateException("OTP has expired");
        }
        if (!otp.getCode().equals(req.getCode())) {
            // Cap brute-force: after 5 wrong guesses the code is consumed and must be re-requested.
            otp.setAttempts(otp.getAttempts() + 1);
            if (otp.getAttempts() >= 5) {
                otp.setConsumedAt(OffsetDateTime.now());
                otpRepo.save(otp);
                throw new IllegalStateException("Too many incorrect attempts — request a new code");
            }
            otpRepo.save(otp);
            throw new IllegalStateException("Invalid OTP");
        }

        otp.setConsumedAt(OffsetDateTime.now());
        otpRepo.save(otp);

        // Banned accounts can't obtain a token at all. PENDING is allowed to log in so
        // drivers/vendors can reach their onboarding / awaiting-approval screen; the JWT
        // carries the status so services can block privileged actions for non-ACTIVE users.
        if (user.getStatus() == User.Status.SUSPENDED || user.getStatus() == User.Status.REJECTED) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "This account is " + user.getStatus().name().toLowerCase() + ". Contact support.");
        }

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

    // ── Google Sign-In ──────────────────────────────────────────────────────────

    /**
     * Google gives us a verified email + name. If that email already has an account we
     * log in; otherwise we create one with the email already verified. Either way the
     * response says whether a phone still needs to be added+verified.
     */
    public Map<String, Object> googleSignIn(String idToken, String roleRaw) {
        GoogleTokenVerifier.GoogleUser g = googleVerifier.verify(idToken);

        User.Role role;
        try {
            role = User.Role.valueOf((roleRaw == null || roleRaw.isBlank() ? "RIDER" : roleRaw).toUpperCase());
        } catch (IllegalArgumentException e) {
            role = User.Role.RIDER;
        }
        // Never let Google sign-up mint privileged accounts.
        if (role == User.Role.ADMIN || role == User.Role.SUPER_ADMIN) role = User.Role.RIDER;

        // The role names the app, and identity is scoped to it: signing in with Google on the
        // driver app must not find (or create) the passenger account on the same address.
        User.App app = User.App.of(role);

        User user = userRepo.findByEmailAndApp(g.email(), app).orElse(null);
        if (user == null) {
            user = new User();
            user.setApp(app);
            user.setEmail(g.email());
            if (g.name() != null && !g.name().isBlank()) user.setName(g.name().trim());
            user.setRole(role);
            boolean needsApproval = role == User.Role.DRIVER
                || role == User.Role.COURIER
                || role == User.Role.RESTAURANT_OWNER;
            user.setStatus(needsApproval ? User.Status.PENDING : User.Status.ACTIVE);
            userRepo.save(user);
            log.info("[AUTH] google sign-up email={} role={}", g.email(), role);
        }

        requireLoginableStatus(user);
        TokenResponse tokens = issueTokens(user);
        boolean needsPhone = user.getPhone() == null || user.getPhone().isBlank();
        return Map.of(
            "accessToken", tokens.accessToken(),
            "refreshToken", tokens.refreshToken(),
            "role", tokens.role(),
            "needsPhone", needsPhone);
    }

    // ── Adding a phone to an account (completes Google sign-up) ─────────────────

    /** Step 1: validate the Ghanaian number is free, then SMS a code. */
    public RegisterResponse startAddPhone(String userId, String phoneRaw) {
        User user = userRepo.findById(UUID.fromString(userId))
            .orElseThrow(() -> new IllegalStateException("User not found"));
        String phone = requireValidGhanaPhone(normalizePhone(phoneRaw));
        userRepo.findByPhoneAndApp(phone, user.getApp()).ifPresent(other -> {
            if (!other.getId().equals(user.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "That number is already in use.");
            }
        });
        issueOtp(phone, user.getApp());
        return new RegisterResponse(phone, "Verification code sent by SMS");
    }

    /** Step 2: confirm the SMS code, attaching the verified phone. */
    public UserResponse verifyAddPhone(String userId, String phoneRaw, String code) {
        User user = userRepo.findById(UUID.fromString(userId))
            .orElseThrow(() -> new IllegalStateException("User not found"));
        String phone = requireValidGhanaPhone(normalizePhone(phoneRaw));
        userRepo.findByPhoneAndApp(phone, user.getApp()).ifPresent(other -> {
            if (!other.getId().equals(user.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "That number is already in use.");
            }
        });
        OtpCode otp = otpRepo.findTopByPhoneAndAppAndConsumedAtIsNullOrderByExpiresAtDesc(phone, user.getApp())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No pending code for this number."));
        consumeOrFail(otp, code);

        user.setPhone(phone);
        userRepo.save(user);
        log.info("[AUTH] phone verified + attached for user {}", userId);
        return toUserResponse(user);
    }

    // ── Adding an email + password to an existing (phone-verified) account ──────

    /**
     * Step 1: the signed-in user supplies an email + a new password. We validate the email
     * is free, store the password hash, and email a verification code. The email is NOT
     * attached to the account until it's verified in step 2.
     */
    public RegisterResponse startAddEmail(String userId, String email, String password) {
        User user = userRepo.findById(UUID.fromString(userId))
            .orElseThrow(() -> new IllegalStateException("User not found"));

        String normalized = normalizeEmail(email);
        if (normalized == null || !normalized.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid email address.");
        }
        if (password == null || password.length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password must be at least 6 characters.");
        }
        userRepo.findByEmailAndApp(normalized, user.getApp()).ifPresent(other -> {
            if (!other.getId().equals(user.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "That email is already in use.");
            }
        });

        // Safe to store now — the email (the thing you log in with) only lands after verification.
        user.setPasswordHash(encoder.encode(password));
        userRepo.save(user);

        issueEmailOtp(normalized, user.getApp());
        return new RegisterResponse(normalized, "Verification code sent to your email");
    }

    /** Step 2: confirm the emailed code, which attaches the verified email to the account. */
    public UserResponse verifyAddEmail(String userId, String email, String code) {
        User user = userRepo.findById(UUID.fromString(userId))
            .orElseThrow(() -> new IllegalStateException("User not found"));

        String normalized = normalizeEmail(email);
        userRepo.findByEmailAndApp(normalized, user.getApp()).ifPresent(other -> {
            if (!other.getId().equals(user.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "That email is already in use.");
            }
        });

        OtpCode otp = otpRepo.findTopByEmailAndAppAndConsumedAtIsNullOrderByExpiresAtDesc(normalized, user.getApp())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No pending code for this email."));
        consumeOrFail(otp, code);

        user.setEmail(normalized);
        userRepo.save(user);
        log.info("[AUTH] email verified + attached for user {}", userId);
        return toUserResponse(user);
    }

    /** Email + password login — only works once the email has been verified. */
    public TokenResponse loginEmailPassword(String email, String password, String appRaw) {
        String normalized = normalizeEmail(email);
        // Same "wrong credentials" answer whether the account is missing, in another app, or the
        // password is wrong — the failure must not reveal which accounts exist where.
        User user = findForPasswordLogin(normalized, appRaw)
            .orElseThrow(() -> new AccessDeniedException("Invalid email or password"));
        if (user.getPasswordHash() == null || password == null
                || !encoder.matches(password, user.getPasswordHash())) {
            throw new AccessDeniedException("Invalid email or password");
        }
        requireLoginableStatus(user);
        return issueTokens(user);
    }

    /** Shared OTP check: expiry, 5-attempt cap, then consume. */
    private void consumeOrFail(OtpCode otp, String code) {
        if (!otp.isValid()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Code has expired — request a new one.");
        }
        if (!otp.getCode().equals(code)) {
            otp.setAttempts(otp.getAttempts() + 1);
            if (otp.getAttempts() >= 5) {
                otp.setConsumedAt(OffsetDateTime.now());
                otpRepo.save(otp);
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Too many incorrect attempts — request a new code.");
            }
            otpRepo.save(otp);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid code");
        }
        otp.setConsumedAt(OffsetDateTime.now());
        otpRepo.save(otp);
    }

    /**
     * Log out: revoke the refresh token so the session can't be resumed.
     *
     * Access tokens are stateless and can't be withdrawn, which is exactly why they are
     * short-lived — the refresh token is the part that grants long-lived access, so that is
     * the part logout kills. Without a supplied token (an app that lost it, or a "log out
     * everywhere" request) every session for the user is revoked.
     */
    public void logout(String userId, String refreshToken, boolean allDevices) {
        UUID id = UUID.fromString(userId);
        if (allDevices || refreshToken == null || refreshToken.isBlank()) {
            refreshRepo.revokeAllForUser(id);
            log.info("[AUTH] logout — all sessions revoked for user {}", userId);
            return;
        }
        refreshRepo.findByTokenHash(sha256(refreshToken)).ifPresent(rt -> {
            // Only your own token: presenting someone else's must not log them out.
            if (!rt.getUser().getId().equals(id)) return;
            rt.setRevoked(true);
            refreshRepo.save(rt);
        });
        log.info("[AUTH] logout — session revoked for user {}", userId);
    }

    /** Return current user profile. */
    @Transactional(readOnly = true)
    public UserResponse me(String userId) {
        User user = userRepo.findById(UUID.fromString(userId))
            .orElseThrow(() -> new IllegalStateException("User not found"));
        return toUserResponse(user);
    }

    /**
     * Edit the signed-in user's own display name / username (the account screen).
     * Phone and email are login credentials and are deliberately not editable here —
     * they change through {@link #startAddPhone}/{@link #startAddEmail}, which verify
     * the new value with a code before attaching it.
     *
     * A null field is left unchanged; a blank one is a 400 rather than a silent wipe.
     */
    public UserResponse updateProfile(String userId, UpdateProfileRequest req) {
        User user = userRepo.findById(UUID.fromString(userId))
            .orElseThrow(() -> new IllegalStateException("User not found"));

        if (req.getName() != null) {
            String name = req.getName().trim();
            if (name.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your name can't be empty.");
            }
            user.setName(name);
        }

        if (req.getUsername() != null) {
            // An admin's username is their login handle for the operator console — changing
            // it from a client app would be a foot-gun, so it stays admin-managed.
            if (user.getRole() == User.Role.ADMIN || user.getRole() == User.Role.SUPER_ADMIN) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "An admin username can only be changed by a super admin.");
            }
            user.setUsername(requireAvailableUsername(req.getUsername(), user.getId(), user.getApp()));
        }

        userRepo.save(user);
        log.info("[AUTH] profile updated for user {}", userId);
        return toUserResponse(user);
    }

    /**
     * Canonicalise a username (trimmed, lower-case) and assert it is well-formed and free.
     * {@code selfId} is the account being edited — its own current username doesn't count
     * as taken — or null at sign-up.
     */
    private String requireAvailableUsername(String raw, UUID selfId, User.App app) {
        String username = raw == null ? "" : raw.trim().toLowerCase();
        if (username.length() < 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Username must be at least 3 characters.");
        }
        if (!username.matches("^[a-z0-9._]{3,30}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Use only letters, numbers, dots and underscores.");
        }
        boolean taken = userRepo.findByUsernameAndApp(username, app)
            .map(other -> selfId == null || !other.getId().equals(selfId))
            .orElse(false);
        if (taken) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That username is already taken.");
        }
        return username;
    }

    /**
     * Driver submits their KYC documents.
     *
     * The three photographs are **required**. They used to be optional, and in practice they were
     * hardcoded placeholder strings the app never actually sent — so an admin pressing Approve was
     * approving a URL that pointed at nothing. There is no point reviewing an identity you cannot
     * see, so a submission without them is refused rather than quietly queued.
     */
    public KycResponse submitKyc(String userId, KycSubmitRequest req) {
        User user = userRepo.findById(UUID.fromString(userId))
            .orElseThrow(() -> new IllegalStateException("User not found"));

        if (user.getRole() != User.Role.DRIVER) {
            throw new AccessDeniedException("Only DRIVER accounts can submit KYC");
        }

        requireDoc(req.getIdSelfieUrl(), "a photo of yourself");
        requireDoc(req.getLicenceUrl(), "a photo of your driving licence");
        requireDoc(req.getVehiclePhotoUrl(), "a photo of your vehicle");

        DriverKyc kyc = new DriverKyc();
        kyc.setUser(user);
        kyc.setLicenceNo(req.getLicenceNo());
        kyc.setVehicleReg(req.getVehicleReg());
        kyc.setRoadworthyUrl(req.getRoadworthyUrl());
        kyc.setIdSelfieUrl(req.getIdSelfieUrl());
        kyc.setLicenceUrl(req.getLicenceUrl());
        kyc.setVehiclePhotoUrl(req.getVehiclePhotoUrl());
        kycRepo.save(kyc);
        log.info("[KYC] {} submitted by driver {}", kyc.getId(), userId);

        return toKycResponse(kyc);
    }

    /**
     * A document reference must be one of ours.
     *
     * Rejecting anything that is not an `/auth/uploads/...` path is the point: without it a driver
     * could submit a link to any image anywhere, which is exactly the placeholder-URL problem this
     * replaced — and it would let a submission point at a URL whose contents can change after
     * review.
     */
    private void requireDoc(String url, String what) {
        if (url == null || url.isBlank()) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST, "Please add " + what + ".");
        }
        if (!url.startsWith("/auth/uploads/")) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "Documents must be uploaded through the app.");
        }
    }

    /** A driver's own latest KYC submission (null if they haven't submitted yet). */
    @Transactional(readOnly = true)
    public KycResponse myKyc(String userId) {
        return kycRepo.findTopByUserIdOrderByCreatedAtDesc(UUID.fromString(userId))
            .map(this::toKycResponse)
            .orElse(null);
    }

    /** Admin lists KYC submissions, optionally filtered by status. */
    @Transactional(readOnly = true)
    public List<KycResponse> listKyc(String status) {
        List<DriverKyc> rows = (status == null || status.isBlank())
            ? kycRepo.findAllByOrderByCreatedAtDesc()
            : kycRepo.findByStatusOrderByCreatedAtDesc(DriverKyc.KycStatus.valueOf(status.toUpperCase()));
        return rows.stream().map(this::toKycResponse).toList();
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

    // ── Admin auth + management ─────────────────────────────────────────────────

    /** Admin step 1: verify username+password, then OTP the phone on file (2FA). */
    public AdminLoginResponse adminLogin(AdminLoginRequest req) {
        User user = userRepo.findByUsernameAndApp(req.getUsername(), User.App.ADMIN)
            .orElseThrow(() -> new AccessDeniedException("Invalid credentials"));
        if (user.getRole() != User.Role.ADMIN && user.getRole() != User.Role.SUPER_ADMIN) {
            throw new AccessDeniedException("Not an admin account");
        }
        if (user.getPasswordHash() == null || !encoder.matches(req.getPassword(), user.getPasswordHash())) {
            throw new AccessDeniedException("Invalid credentials");
        }
        issueOtp(user.getPhone(), user.getApp());
        return new AdminLoginResponse(user.getPhone(), "OTP sent to the phone on file");
    }

    /** Super admin creates an ADMIN account (username + password + phone). */
    public UserResponse createAdmin(CreateAdminRequest req) {
        if (userRepo.existsByUsernameAndApp(req.getUsername(), User.App.ADMIN)) {
            throw new IllegalStateException("Username already taken");
        }
        if (userRepo.existsByPhoneAndApp(req.getPhone(), User.App.ADMIN)) {
            throw new IllegalStateException("Phone already registered");
        }
        User u = new User();
        u.setApp(User.App.ADMIN);
        u.setName(req.getName().trim());
        u.setUsername(req.getUsername().trim());
        u.setPasswordHash(encoder.encode(req.getPassword()));
        u.setPhone(req.getPhone().trim());
        u.setRole(User.Role.ADMIN);
        u.setStatus(User.Status.ACTIVE);
        userRepo.save(u);
        log.info("[ADMIN] created admin username={} id={}", u.getUsername(), u.getId());
        return toUserResponse(u);
    }

    /**
     * Count ACTIVE okada delivery riders (couriers/drivers in a delivery-capable mode).
     * food-service calls this before accepting a delivery order so it can tell the
     * customer up-front when no delivery rider is available.
     */
    @Transactional(readOnly = true)
    public long countAvailableDeliveryRiders() {
        return userRepo.countByStatusAndVehicleClassAndRoleInAndServiceModeIn(
            User.Status.ACTIVE,
            User.VehicleClass.OKADA,
            List.of(User.Role.COURIER, User.Role.DRIVER),
            List.of(User.ServiceMode.DELIVERIES, User.ServiceMode.BOTH));
    }

    /** Admin lists users by status (e.g. PENDING drivers/vendors awaiting approval). */
    @Transactional(readOnly = true)
    public List<UserResponse> listUsersByStatus(String status) {
        return userRepo.findByStatusOrderByCreatedAtDesc(User.Status.valueOf(status.toUpperCase()))
            .stream().map(this::toUserResponse).toList();
    }

    /**
     * Drivers and couriers whose vehicle class an admin still has to set.
     *
     * <p>Separate from the approvals list on purpose. Approving an account and grading a vehicle
     * are two different judgements: a car has to be seen before it can be called Standard or Luxe,
     * and that can happen after the account is already live. Because the approvals list filters on
     * PENDING, an approved car driver fell off every admin screen while their own app still read
     * "Awaiting admin" — a queue with no queue attached to it.
     */
    @Transactional(readOnly = true)
    public List<UserResponse> listAwaitingVehicleClass() {
        return userRepo.findByRoleInAndVehicleClassIsNullAndStatusNotOrderByCreatedAtDesc(
                List.of(User.Role.DRIVER, User.Role.COURIER), User.Status.REJECTED)
            .stream().map(this::toUserResponse).toList();
    }

    /** Admin approves (ACTIVE) or rejects (REJECTED) a pending account. */
    public UserResponse reviewUser(UUID userId, String status) {
        User u = userRepo.findById(userId)
            .orElseThrow(() -> new IllegalStateException("User not found"));
        u.setStatus(User.Status.valueOf(status.toUpperCase()));
        userRepo.save(u);
        log.info("[ADMIN] user {} status -> {}", userId, u.getStatus());
        return toUserResponse(u);
    }

    private UserResponse toUserResponse(User u) {
        return new UserResponse(
            u.getId(), u.getPhone(), u.getEmail(), u.getName(), u.getUsername(),
            u.getRole().name(), u.getStatus().name(),
            u.getVehicleClass() != null ? u.getVehicleClass().name() : null,
            u.getServiceMode() != null ? u.getServiceMode().name() : "BOTH");
    }

    /** Map the driver's self-selected vehicle class (OKADA/CARGO). A car → null (admin sets the tier). */
    private User.VehicleClass parseVehicleClass(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            User.VehicleClass vc = User.VehicleClass.valueOf(raw.trim().toUpperCase());
            // Only OKADA/CARGO are self-assignable at sign-up; STANDARD/LUXE are admin-set.
            return (vc == User.VehicleClass.OKADA || vc == User.VehicleClass.CARGO) ? vc : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Admin assigns a driver's vehicle class (e.g. Standard/Luxe after seeing the car). */
    public UserResponse assignVehicleClass(UUID userId, String vehicleClass) {
        User u = userRepo.findById(userId)
            .orElseThrow(() -> new IllegalStateException("User not found"));
        u.setVehicleClass(User.VehicleClass.valueOf(vehicleClass.trim().toUpperCase()));
        userRepo.save(u);
        log.info("[ADMIN] user {} vehicle_class -> {}", userId, u.getVehicleClass());
        return toUserResponse(u);
    }

    /** Driver sets their own service mode (RIDES / DELIVERIES / BOTH). */
    public UserResponse setServiceMode(String userId, String mode) {
        User u = userRepo.findById(UUID.fromString(userId))
            .orElseThrow(() -> new IllegalStateException("User not found"));
        u.setServiceMode(User.ServiceMode.valueOf(mode.trim().toUpperCase()));
        userRepo.save(u);
        return toUserResponse(u);
    }

    // ── private helpers ────────────────────────────────────────────────────────

    /**
     * Canonicalise a Ghana phone number to E.164 (+233…) so the same account is found
     * regardless of how the user typed it (local "0201…", "233201…", or "+233201…").
     * Strips spaces/dashes/parentheses. Unknown formats are returned digits-only so at
     * least sign-up and login agree on the same string.
     */
    private String normalizePhone(String raw) {
        if (raw == null) return null;
        String p = raw.replaceAll("[\\s()\\-]", "");
        if (p.startsWith("+")) return p;
        if (p.startsWith("233")) return "+" + p;
        if (p.startsWith("0") && p.length() == 10) return "+233" + p.substring(1);
        return p;
    }

    /** Valid Ghana mobile network prefixes (the two digits after the 0 / +233). */
    private static final java.util.Set<String> GH_PREFIXES = java.util.Set.of(
        "20", "23", "24", "25", "26", "27", "28", "29",
        "50", "53", "54", "55", "56", "57", "59");

    /**
     * Validate that a normalised number is a real Ghanaian mobile line: +233 followed by a
     * 9-digit national number that starts with a known network prefix. Rejects foreign or
     * malformed numbers with a 400 so the user gets a clear message.
     */
    private String requireValidGhanaPhone(String e164) {
        if (e164 != null && e164.startsWith("+233") && e164.length() == 13) {
            String nsn = e164.substring(4); // the 9 digits after +233
            if (nsn.matches("\\d{9}") && GH_PREFIXES.contains(nsn.substring(0, 2))) {
                return e164;
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "Please enter a valid Ghanaian mobile number (e.g. 024 123 4567).");
    }

    private void issueOtp(String phone, User.App app) {
        String code = generateOtp();
        OtpCode otp = new OtpCode();
        otp.setApp(app);
        otp.setPhone(phone);
        otp.setCode(code);
        otp.setExpiresAt(OffsetDateTime.now().plusMinutes(otpExpiryMinutes));
        otpRepo.save(otp);
        // Sent via the configured SMS provider; otherwise SmsService logs the code.
        smsService.sendOtp(phone, code, otpExpiryMinutes);
    }

    private void issueEmailOtp(String email, User.App app) {
        String code = generateOtp();
        OtpCode otp = new OtpCode();
        otp.setApp(app);
        otp.setEmail(email);
        otp.setCode(code);
        otp.setExpiresAt(OffsetDateTime.now().plusMinutes(otpExpiryMinutes));
        otpRepo.save(otp);
        // Sent via Gmail SMTP when configured; otherwise EmailService logs the code.
        emailService.sendVerificationCode(email, code, otpExpiryMinutes);
    }

    // ── Which app is asking ─────────────────────────────────────────────────────

    /**
     * The app named in a sign-up request, or the one the role implies.
     *
     * Inferring from the role keeps older clients and the seed scripts working: a request for
     * role=RIDER can only sensibly mean the passenger app. What it never does is let a caller into
     * the admin app — {@link #requireSelfSignupAllowed} refuses that whichever way the app arrived.
     */
    private User.App appForSignup(String appRaw, User.Role role) {
        User.App app = parseApp(appRaw);
        return app != null ? app : User.App.of(role);
    }

    private User.App parseApp(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return User.App.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown app: " + raw);
        }
    }

    /**
     * An app may only create the roles that belong to it, and no app may create an admin.
     *
     * {@code register} used to hand {@code User.Role.valueOf} whatever string arrived and trust it.
     * ADMIN is not in the needs-approval set, so posting role=ADMIN to the public endpoint created
     * a live admin and the OTP flow then handed over a working admin token — no authentication
     * anywhere in that path. Admins are created by a SUPER_ADMIN through POST /auth/admins only.
     */
    private void requireSelfSignupAllowed(User.App app, User.Role role) {
        if (role == User.Role.ADMIN || role == User.Role.SUPER_ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin accounts cannot be self-registered.");
        }
        if (!app.allowsSelfSignup(role)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "The " + app.name().toLowerCase() + " app cannot create a " + role.name() + " account.");
        }
    }

    /**
     * Find the account a sign-in is for.
     *
     * With an app named it is a direct lookup. Without one — an older client, or the e2e suite —
     * fall back to the accounts on that number: exactly one is unambiguous, and several means the
     * caller genuinely has to say which, because picking for them would sign someone into the wrong
     * account.
     */
    private User resolveByPhone(String phone, String appRaw, String notFoundMessage) {
        User.App app = parseApp(appRaw);
        if (app != null) {
            return userRepo.findByPhoneAndApp(phone, app)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, notFoundMessage));
        }
        List<User> all = userRepo.findByPhoneOrderByCreatedAtAsc(phone);
        if (all.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, notFoundMessage);
        if (all.size() > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "This number has accounts in more than one app. Please say which app you are signing in to.");
        }
        return all.get(0);
    }

    /**
     * Email lookup for password login — returns empty rather than throwing, so every failure mode
     * collapses into one "invalid email or password" and nothing leaks about which accounts exist.
     */
    private java.util.Optional<User> findForPasswordLogin(String email, String appRaw) {
        User.App app = parseApp(appRaw);
        if (app != null) return userRepo.findByEmailAndApp(email, app);
        List<User> all = userRepo.findByEmailOrderByCreatedAtAsc(email);
        return all.size() == 1 ? java.util.Optional.of(all.get(0)) : java.util.Optional.empty();
    }

    private User resolveByEmail(String email, String appRaw, String notFoundMessage) {
        User.App app = parseApp(appRaw);
        if (app != null) {
            return userRepo.findByEmailAndApp(email, app)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, notFoundMessage));
        }
        List<User> all = userRepo.findByEmailOrderByCreatedAtAsc(email);
        if (all.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, notFoundMessage);
        if (all.size() > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "This email has accounts in more than one app. Please say which app you are signing in to.");
        }
        return all.get(0);
    }

    private String normalizeEmail(String raw) {
        return raw == null ? null : raw.trim().toLowerCase();
    }

    /** Suspended/rejected accounts can never obtain a token, whichever login route is used. */
    private void requireLoginableStatus(User user) {
        if (user.getStatus() == User.Status.SUSPENDED || user.getStatus() == User.Status.REJECTED) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "This account is " + user.getStatus().name().toLowerCase() + ". Contact support.");
        }
    }

    private TokenResponse issueTokens(User user) {
        return new TokenResponse(
            jwtService.generateAccessToken(user),
            generateAndSaveRefreshToken(user),
            user.getRole().name());
    }

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
        User u = kyc.getUser();
        return new KycResponse(
            kyc.getId(),
            u.getId(),
            kyc.getStatus().name(),
            kyc.getLicenceNo(),
            kyc.getVehicleReg(),
            u.getName(),
            u.getPhone(),
            kyc.getIdSelfieUrl(),
            kyc.getLicenceUrl(),
            kyc.getVehiclePhotoUrl(),
            kyc.getRoadworthyUrl()
        );
    }
}
