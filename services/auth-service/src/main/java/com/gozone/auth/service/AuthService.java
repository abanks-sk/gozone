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

        // Sign-up only: a phone that already has an account must log in, not re-register
        // (otherwise "Create account" with an existing number silently logs into that account).
        if (userRepo.existsByPhone(phone)) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT, "An account with this number already exists. Please log in.");
        }

        // Username is chosen at sign-up and must be unique across all accounts.
        String username = req.getUsername() == null || req.getUsername().isBlank()
            ? null
            : requireAvailableUsername(req.getUsername(), null);

        User user = new User();
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

        issueOtp(phone);
        return new RegisterResponse(phone, "OTP sent (see server logs in dev)");
    }

    /**
     * Login (phone-only): issue an OTP only if this phone already has an account.
     * Unlike {@link #register}, this never creates a user — an unknown number is a 404.
     */
    public RegisterResponse login(LoginRequest req) {
        String phone = requireValidGhanaPhone(normalizePhone(req.getPhone()));
        if (!userRepo.existsByPhone(phone)) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND, "No account found for this number. Please sign up.");
        }
        issueOtp(phone);
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
        if (userRepo.existsByEmail(email)) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT, "An account with this email already exists. Please log in.");
        }

        User user = new User();
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

        issueEmailOtp(email);
        return new RegisterResponse(email, "OTP sent (see server logs in dev)");
    }

    /** Email login: issue an OTP only if this email already has an account. */
    public RegisterResponse loginEmail(EmailLoginRequest req) {
        String email = normalizeEmail(req.getEmail());
        if (!userRepo.existsByEmail(email)) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND, "No account found for this email. Please sign up.");
        }
        issueEmailOtp(email);
        return new RegisterResponse(email, "OTP sent (see server logs in dev)");
    }

    /** Verify OTP (by email if provided, else phone); return access + refresh token pair. */
    public TokenResponse verifyOtp(VerifyOtpRequest req) {
        boolean byEmail = req.getEmail() != null && !req.getEmail().isBlank();

        OtpCode otp;
        User user;
        if (byEmail) {
            String email = normalizeEmail(req.getEmail());
            otp = otpRepo.findTopByEmailAndConsumedAtIsNullOrderByExpiresAtDesc(email)
                .orElseThrow(() -> new IllegalStateException("No pending OTP for this email"));
            user = userRepo.findByEmail(email)
                .orElseThrow(() -> new IllegalStateException("User not found for email " + email));
        } else {
            String phone = normalizePhone(req.getPhone());
            otp = otpRepo.findTopByPhoneAndConsumedAtIsNullOrderByExpiresAtDesc(phone)
                .orElseThrow(() -> new IllegalStateException("No pending OTP for this phone"));
            user = userRepo.findByPhone(phone)
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

        User user = userRepo.findByEmail(g.email()).orElse(null);
        if (user == null) {
            User.Role role;
            try {
                role = User.Role.valueOf((roleRaw == null || roleRaw.isBlank() ? "RIDER" : roleRaw).toUpperCase());
            } catch (IllegalArgumentException e) {
                role = User.Role.RIDER;
            }
            // Never let Google sign-up mint privileged accounts.
            if (role == User.Role.ADMIN || role == User.Role.SUPER_ADMIN) role = User.Role.RIDER;

            user = new User();
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
        userRepo.findByPhone(phone).ifPresent(other -> {
            if (!other.getId().equals(user.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "That number is already in use.");
            }
        });
        issueOtp(phone);
        return new RegisterResponse(phone, "Verification code sent by SMS");
    }

    /** Step 2: confirm the SMS code, attaching the verified phone. */
    public UserResponse verifyAddPhone(String userId, String phoneRaw, String code) {
        User user = userRepo.findById(UUID.fromString(userId))
            .orElseThrow(() -> new IllegalStateException("User not found"));
        String phone = requireValidGhanaPhone(normalizePhone(phoneRaw));
        userRepo.findByPhone(phone).ifPresent(other -> {
            if (!other.getId().equals(user.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "That number is already in use.");
            }
        });
        OtpCode otp = otpRepo.findTopByPhoneAndConsumedAtIsNullOrderByExpiresAtDesc(phone)
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
        userRepo.findByEmail(normalized).ifPresent(other -> {
            if (!other.getId().equals(user.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "That email is already in use.");
            }
        });

        // Safe to store now — the email (the thing you log in with) only lands after verification.
        user.setPasswordHash(encoder.encode(password));
        userRepo.save(user);

        issueEmailOtp(normalized);
        return new RegisterResponse(normalized, "Verification code sent to your email");
    }

    /** Step 2: confirm the emailed code, which attaches the verified email to the account. */
    public UserResponse verifyAddEmail(String userId, String email, String code) {
        User user = userRepo.findById(UUID.fromString(userId))
            .orElseThrow(() -> new IllegalStateException("User not found"));

        String normalized = normalizeEmail(email);
        userRepo.findByEmail(normalized).ifPresent(other -> {
            if (!other.getId().equals(user.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "That email is already in use.");
            }
        });

        OtpCode otp = otpRepo.findTopByEmailAndConsumedAtIsNullOrderByExpiresAtDesc(normalized)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No pending code for this email."));
        consumeOrFail(otp, code);

        user.setEmail(normalized);
        userRepo.save(user);
        log.info("[AUTH] email verified + attached for user {}", userId);
        return toUserResponse(user);
    }

    /** Email + password login — only works once the email has been verified. */
    public TokenResponse loginEmailPassword(String email, String password) {
        String normalized = normalizeEmail(email);
        User user = userRepo.findByEmail(normalized)
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
            user.setUsername(requireAvailableUsername(req.getUsername(), user.getId()));
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
    private String requireAvailableUsername(String raw, UUID selfId) {
        String username = raw == null ? "" : raw.trim().toLowerCase();
        if (username.length() < 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Username must be at least 3 characters.");
        }
        if (!username.matches("^[a-z0-9._]{3,30}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Use only letters, numbers, dots and underscores.");
        }
        boolean taken = userRepo.findByUsername(username)
            .map(other -> selfId == null || !other.getId().equals(selfId))
            .orElse(false);
        if (taken) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That username is already taken.");
        }
        return username;
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
        User user = userRepo.findByUsername(req.getUsername())
            .orElseThrow(() -> new AccessDeniedException("Invalid credentials"));
        if (user.getRole() != User.Role.ADMIN && user.getRole() != User.Role.SUPER_ADMIN) {
            throw new AccessDeniedException("Not an admin account");
        }
        if (user.getPasswordHash() == null || !encoder.matches(req.getPassword(), user.getPasswordHash())) {
            throw new AccessDeniedException("Invalid credentials");
        }
        issueOtp(user.getPhone());
        return new AdminLoginResponse(user.getPhone(), "OTP sent to the phone on file");
    }

    /** Super admin creates an ADMIN account (username + password + phone). */
    public UserResponse createAdmin(CreateAdminRequest req) {
        if (userRepo.existsByUsername(req.getUsername())) {
            throw new IllegalStateException("Username already taken");
        }
        if (userRepo.existsByPhone(req.getPhone())) {
            throw new IllegalStateException("Phone already registered");
        }
        User u = new User();
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

    private void issueOtp(String phone) {
        String code = generateOtp();
        OtpCode otp = new OtpCode();
        otp.setPhone(phone);
        otp.setCode(code);
        otp.setExpiresAt(OffsetDateTime.now().plusMinutes(otpExpiryMinutes));
        otpRepo.save(otp);
        // Sent via the configured SMS provider; otherwise SmsService logs the code.
        smsService.sendOtp(phone, code, otpExpiryMinutes);
    }

    private void issueEmailOtp(String email) {
        String code = generateOtp();
        OtpCode otp = new OtpCode();
        otp.setEmail(email);
        otp.setCode(code);
        otp.setExpiresAt(OffsetDateTime.now().plusMinutes(otpExpiryMinutes));
        otpRepo.save(otp);
        // Sent via Gmail SMTP when configured; otherwise EmailService logs the code.
        emailService.sendVerificationCode(email, code, otpExpiryMinutes);
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
        return new KycResponse(
            kyc.getId(),
            kyc.getUser().getId(),
            kyc.getStatus().name(),
            kyc.getLicenceNo(),
            kyc.getVehicleReg()
        );
    }
}
