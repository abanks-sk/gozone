package com.gozone.food.dto;

import java.math.BigDecimal;

/** Platform fee config (admin-controlled): service fee % + distance-based delivery rates. */
public record PlatformFeesResponse(
    BigDecimal serviceFeePct,
    BigDecimal deliveryBaseFee,
    BigDecimal deliveryPerKm
) {}
