package com.gozone.auth.dto;

import java.util.UUID;

public record UserResponse(
    UUID id, String phone, String email, String name, String role, String status,
    String vehicleClass, String serviceMode
) {}
