package com.gozone.auth.dto;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * A pending change to something that was already verified.
 *
 * <p>{@code current} and {@code proposed} carry only the fields the request actually touches, so an
 * admin sees the two side by side without having to fetch the account and diff it themselves —
 * which is the whole decision they are being asked to make.
 */
public record EditRequestResponse(
    UUID id,
    UUID userId,
    String driverName,
    String driverPhone,
    String status,
    /** What it is today, for each field being changed. */
    Map<String, String> current,
    /** What the driver is asking it to become. */
    Map<String, String> proposed,
    /** Why the driver says it changed. */
    String reason,
    /** Why the admin decided as they did — the driver is shown it. */
    String reviewNote,
    OffsetDateTime createdAt,
    OffsetDateTime reviewedAt
) {}
