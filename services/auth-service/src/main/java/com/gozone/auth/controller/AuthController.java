package com.gozone.auth.controller;

import com.gozone.auth.dto.*;
import com.gozone.auth.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Auth / Identity endpoints. Context-path is /auth (set in application.yml),
 * so the gateway routes /auth/** → this service and paths here have no /auth prefix.
 */
@RestController
public class AuthController {

    private final AuthService authService;

    /** Shared secret for internal service-to-service calls (never sent to clients). */
    @Value("${app.internal.key}")
    private String internalKey;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    private void requireInternal(String key) {
        if (key == null || !key.equals(internalKey)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Internal call only");
        }
    }

    /**
     * Internal: how many okada delivery riders are available right now. food-service
     * calls this (with the shared internal key) before accepting a delivery order.
     */
    @GetMapping("/delivery-riders/availability")
    public ResponseEntity<Map<String, Object>> deliveryRiderAvailability(
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireInternal(key);
        long count = authService.countAvailableDeliveryRiders();
        return ResponseEntity.ok(Map.of("available", count > 0, "count", count));
    }

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest req) {
        return ResponseEntity.ok(authService.register(req));
    }

    @PostMapping("/login")
    public ResponseEntity<RegisterResponse> login(@Valid @RequestBody LoginRequest req) {
        return ResponseEntity.ok(authService.login(req));
    }

    @PostMapping("/register-email")
    public ResponseEntity<RegisterResponse> registerEmail(@Valid @RequestBody EmailRegisterRequest req) {
        return ResponseEntity.ok(authService.registerEmail(req));
    }

    @PostMapping("/login-email")
    public ResponseEntity<RegisterResponse> loginEmail(@Valid @RequestBody EmailLoginRequest req) {
        return ResponseEntity.ok(authService.loginEmail(req));
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<TokenResponse> verifyOtp(@Valid @RequestBody VerifyOtpRequest req) {
        return ResponseEntity.ok(authService.verifyOtp(req));
    }

    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refresh(@Valid @RequestBody RefreshRequest req) {
        return ResponseEntity.ok(authService.refresh(req));
    }

    /** Log out — revokes the refresh token (or every session with allDevices=true). */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(
            @AuthenticationPrincipal String userId,
            @RequestBody(required = false) Map<String, Object> body) {
        String refreshToken = body != null && body.get("refreshToken") != null
            ? String.valueOf(body.get("refreshToken"))
            : null;
        boolean allDevices = body != null && Boolean.parseBoolean(String.valueOf(body.get("allDevices")));
        authService.logout(userId, refreshToken, allDevices);
        return ResponseEntity.ok(Map.of("status", "logged out"));
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(authService.me(userId));
    }

    /** Edit your own display name / username. Phone + email change via their verify flows. */
    @PatchMapping("/me")
    public ResponseEntity<UserResponse> updateProfile(
            @AuthenticationPrincipal String userId,
            @Valid @RequestBody UpdateProfileRequest req) {
        return ResponseEntity.ok(authService.updateProfile(userId, req));
    }

    // ── Add an email + password to a phone-verified account (Settings) ───────────

    /** Step 1: supply email + new password → a verification code is emailed. */
    /** Google Sign-In: verifies the Google ID token, logs in or creates the account. */
    @PostMapping("/google")
    public ResponseEntity<Map<String, Object>> googleSignIn(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(authService.googleSignIn(body.get("idToken"), body.get("role")));
    }

    /** Add a phone to the signed-in account (completes Google sign-up) — sends an SMS code. */
    @PostMapping("/me/phone")
    public ResponseEntity<RegisterResponse> startAddPhone(
            @AuthenticationPrincipal String userId,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(authService.startAddPhone(userId, body.get("phone")));
    }

    /** Confirm the SMS code, attaching the verified phone. */
    @PostMapping("/me/phone/verify")
    public ResponseEntity<UserResponse> verifyAddPhone(
            @AuthenticationPrincipal String userId,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(authService.verifyAddPhone(userId, body.get("phone"), body.get("code")));
    }

    @PostMapping("/me/email")
    public ResponseEntity<RegisterResponse> startAddEmail(
            @AuthenticationPrincipal String userId,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(authService.startAddEmail(
            userId, body.get("email"), body.get("password")));
    }

    /** Step 2: confirm the emailed code → the verified email is attached to the account. */
    @PostMapping("/me/email/verify")
    public ResponseEntity<UserResponse> verifyAddEmail(
            @AuthenticationPrincipal String userId,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(authService.verifyAddEmail(
            userId, body.get("email"), body.get("code")));
    }

    /** Email + password login (available once the email is verified). */
    @PostMapping("/login-email-password")
    public ResponseEntity<TokenResponse> loginEmailPassword(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(authService.loginEmailPassword(
            body.get("email"), body.get("password")));
    }

    // ── Admin auth + management ─────────────────────────────────────────────────

    @PostMapping("/admin/login")
    public ResponseEntity<AdminLoginResponse> adminLogin(@Valid @RequestBody AdminLoginRequest req) {
        return ResponseEntity.ok(authService.adminLogin(req));
    }

    @PostMapping("/admins")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<UserResponse> createAdmin(@Valid @RequestBody CreateAdminRequest req) {
        return ResponseEntity.ok(authService.createAdmin(req));
    }

    @GetMapping("/users")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<List<UserResponse>> listUsers(@RequestParam String status) {
        return ResponseEntity.ok(authService.listUsersByStatus(status));
    }

    @PatchMapping("/users/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<UserResponse> reviewUser(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(authService.reviewUser(id, body.getOrDefault("status", "")));
    }

    @PatchMapping("/users/{id}/class")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<UserResponse> assignClass(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(authService.assignVehicleClass(id, body.getOrDefault("vehicleClass", "")));
    }

    @PatchMapping("/me/service-mode")
    public ResponseEntity<UserResponse> setServiceMode(
            @AuthenticationPrincipal String userId,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(authService.setServiceMode(userId, body.getOrDefault("mode", "BOTH")));
    }

    @PostMapping("/driver/kyc")
    @PreAuthorize("hasRole('DRIVER')")
    public ResponseEntity<KycResponse> submitKyc(
            @AuthenticationPrincipal String userId,
            @RequestBody KycSubmitRequest req) {
        return ResponseEntity.ok(authService.submitKyc(userId, req));
    }

    @GetMapping("/driver/kyc/mine")
    @PreAuthorize("hasRole('DRIVER')")
    public ResponseEntity<KycResponse> myKyc(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(authService.myKyc(userId));
    }

    @GetMapping("/driver/kyc")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<List<KycResponse>> listKyc(
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(authService.listKyc(status));
    }

    @PatchMapping("/driver/kyc/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<KycResponse> reviewKyc(
            @PathVariable UUID id,
            @AuthenticationPrincipal String adminUserId,
            @Valid @RequestBody KycReviewRequest req) {
        return ResponseEntity.ok(authService.reviewKyc(id, adminUserId, req));
    }
}
