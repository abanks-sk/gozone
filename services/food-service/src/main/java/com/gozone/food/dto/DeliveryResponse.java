package com.gozone.food.dto;

import com.gozone.food.model.Delivery;

import java.math.BigDecimal;
import java.util.UUID;

public record DeliveryResponse(
    UUID id,
    UUID orderId,
    String vendorName,
    String dropoffAddr,
    BigDecimal total,
    String status,
    UUID courierId,
    String paymentMethod,
    String paymentStatus
) {
    public static DeliveryResponse from(Delivery d) {
        var o = d.getOrder();
        return new DeliveryResponse(
            d.getId(),
            o.getId(),
            o.getRestaurant().getName(),
            o.getDeliveryAddr(),
            o.getTotal(),
            d.getStatus().name(),
            d.getCourierId(),
            o.getPaymentMethod(),
            o.getPaymentStatus().name()
        );
    }
}
