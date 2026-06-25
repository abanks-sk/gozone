package com.gozone.auth.controller;

import com.gozone.auth.dto.*;
import com.gozone.auth.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Auth / Identity endpoints. Context-path is /auth (set in application.yml),
 * so the gateway routes /auth/** → this service and paths here have no /auth prefix.
 */
@RestController
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest req) {
        return ResponseEntity.ok(authService.register(req));
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<TokenResponse> verifyOtp(@Valid @RequestBody VerifyOtpRequest req) {
        return ResponseEntity.ok(authService.verifyOtp(req));
    }

    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refresh(@Valid @RequestBody RefreshRequest req) {
        return ResponseEntity.ok(authService.refresh(req));
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(authService.me(userId));
    }

    @PostMapping("/driver/kyc")
    @PreAuthorize("hasRole('DRIVER')")
    public ResponseEntity<KycResponse> submitKyc(
            @AuthenticationPrincipal String userId,
            @RequestBody KycSubmitRequest req) {
        return ResponseEntity.ok(authService.submitKyc(userId, req));
    }

    @PatchMapping("/driver/kyc/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<KycResponse> reviewKyc(
            @PathVariable UUID id,
            @AuthenticationPrincipal String adminUserId,
            @Valid @RequestBody KycReviewRequest req) {
        return ResponseEntity.ok(authService.reviewKyc(id, adminUserId, req));
    }
}
