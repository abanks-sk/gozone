package com.gozone.auth.dto;

public record TokenResponse(String accessToken, String refreshToken, String role) {}
