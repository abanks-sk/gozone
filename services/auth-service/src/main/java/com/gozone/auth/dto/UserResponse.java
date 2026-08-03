package com.gozone.auth.dto;

import java.util.UUID;

public record UserResponse(
    UUID id, String phone, String email, String name, String username, String role, String status,
    String vehicleClass, String serviceMode,
    /** Why the account is in this status — the applicant sees this, so a rejection can be acted on. */
    String statusNote
) {}
