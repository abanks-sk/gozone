package com.gozone.ride.dto;

import java.util.UUID;

/**
 * Driver polls their own bid after offering: PENDING while the rider decides,
 * ACCEPTED (+tripId) once chosen, REJECTED if the rider picked someone else.
 * requestStatus lets the driver stop waiting when the request expires/cancels.
 */
public record BidStatusResponse(
    UUID bidId,
    String status,        // PENDING | ACCEPTED | REJECTED | WITHDRAWN
    String requestStatus, // OPEN | MATCHED | EXPIRED | CANCELLED
    UUID tripId           // set once the rider accepts this bid
) {}
