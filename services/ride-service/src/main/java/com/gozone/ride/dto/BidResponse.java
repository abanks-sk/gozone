package com.gozone.ride.dto;

import java.util.UUID;

public record BidResponse(UUID bidId, String status, UUID tripId) {}
