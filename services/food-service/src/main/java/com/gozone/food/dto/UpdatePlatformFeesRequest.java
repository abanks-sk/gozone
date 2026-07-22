package com.gozone.food.dto;

import java.math.BigDecimal;

/** Admin edit of platform fees. Any field may be omitted to leave it unchanged. */
public class UpdatePlatformFeesRequest {
    private BigDecimal serviceFeePct;
    private BigDecimal deliveryBaseFee;
    private BigDecimal deliveryPerKm;

    public BigDecimal getServiceFeePct() { return serviceFeePct; }
    public void setServiceFeePct(BigDecimal serviceFeePct) { this.serviceFeePct = serviceFeePct; }
    public BigDecimal getDeliveryBaseFee() { return deliveryBaseFee; }
    public void setDeliveryBaseFee(BigDecimal deliveryBaseFee) { this.deliveryBaseFee = deliveryBaseFee; }
    public BigDecimal getDeliveryPerKm() { return deliveryPerKm; }
    public void setDeliveryPerKm(BigDecimal deliveryPerKm) { this.deliveryPerKm = deliveryPerKm; }
}
