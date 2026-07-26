package com.gozone.wallet.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Settlement instruction for a completed, paid order.
 *
 * The breakdown matters: the customer's total is goods + service fee + delivery fee, and those
 * three parts belong to the vendor, GoZone and the courier respectively. Sending only the total
 * (as this used to) credited the vendor for the courier's work.
 */
public class SettleOrderRequest {
    @NotNull private UUID orderId;
    @NotNull private UUID restaurantId;
    @NotNull @DecimalMin("0.01") private BigDecimal orderTotal;

    /** Subtotal after discount — the vendor's share before commission. */
    private BigDecimal goods;
    /** GoZone's platform fee, included in orderTotal. */
    private BigDecimal serviceFee;
    /** The courier's fee, included in orderTotal. */
    private BigDecimal deliveryFee;
    /** Assigned courier, or null for pickup / walk-in orders. */
    private UUID courierId;
    /** Cash the courier physically took at the door — they then owe GoZone this much. */
    private BigDecimal cashCollected;

    public UUID getOrderId() { return orderId; }
    public void setOrderId(UUID orderId) { this.orderId = orderId; }
    public UUID getRestaurantId() { return restaurantId; }
    public void setRestaurantId(UUID restaurantId) { this.restaurantId = restaurantId; }
    public BigDecimal getOrderTotal() { return orderTotal; }
    public void setOrderTotal(BigDecimal orderTotal) { this.orderTotal = orderTotal; }
    public BigDecimal getGoods() { return goods; }
    public void setGoods(BigDecimal goods) { this.goods = goods; }
    public BigDecimal getServiceFee() { return serviceFee; }
    public void setServiceFee(BigDecimal serviceFee) { this.serviceFee = serviceFee; }
    public BigDecimal getDeliveryFee() { return deliveryFee; }
    public void setDeliveryFee(BigDecimal deliveryFee) { this.deliveryFee = deliveryFee; }
    public UUID getCourierId() { return courierId; }
    public void setCourierId(UUID courierId) { this.courierId = courierId; }
    public BigDecimal getCashCollected() { return cashCollected; }
    public void setCashCollected(BigDecimal cashCollected) { this.cashCollected = cashCollected; }
}
