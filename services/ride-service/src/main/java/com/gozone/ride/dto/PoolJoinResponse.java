package com.gozone.ride.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record PoolJoinResponse(UUID tripId, BigDecimal lockedFare, String ruleVersion) {}
