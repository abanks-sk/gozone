package com.gozone.ride.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public class PoolJoinRequest {
    @NotNull private UUID requestId;

    public UUID getRequestId() { return requestId; }
    public void setRequestId(UUID requestId) { this.requestId = requestId; }
}
