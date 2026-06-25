package com.gozone.food.dto;

import java.util.UUID;

public record QueuePositionResponse(UUID entryId, int position, String status, UUID orderId) {}
