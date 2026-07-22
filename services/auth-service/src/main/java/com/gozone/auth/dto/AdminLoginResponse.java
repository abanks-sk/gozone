package com.gozone.auth.dto;

/** Returns the phone the OTP was sent to, so the client can complete step 2 (verify-otp). */
public record AdminLoginResponse(String phone, String message) {}
