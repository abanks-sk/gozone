package com.gozone.auth.dto;

import java.util.UUID;

public record UserResponse(UUID id, String phone, String role, String status) {}
