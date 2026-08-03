package com.gozone.auth.dto;

import java.util.UUID;

/**
 * A KYC submission as the driver and the reviewing admin see it.
 *
 * Carries the driver's name and phone because the admin list previously showed a bare user id —
 * you cannot sensibly approve somebody's identity documents while looking at a UUID. The three
 * document URLs are relative paths (`/auth/uploads/{id}`); fetching one still requires being that
 * driver or an admin, so including them here does not widen access.
 */
public record KycResponse(
    UUID id,
    UUID userId,
    String status,
    String licenceNo,
    String vehicleReg,
    String driverName,
    String driverPhone,
    /** The driver's own photograph. */
    String idSelfieUrl,
    /** Photograph of the driving licence. */
    String licenceUrl,
    /** Photograph of the vehicle. */
    String vehiclePhotoUrl,
    /** Optional roadworthy certificate — predates the three required photos. */
    String roadworthyUrl,
    /** Why the reviewer decided as they did — shown to the driver, so a refusal can be acted on. */
    String reviewNote
) {}
