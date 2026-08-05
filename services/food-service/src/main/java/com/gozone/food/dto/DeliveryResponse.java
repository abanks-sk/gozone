package com.gozone.food.dto;

import com.gozone.food.model.Delivery;

import java.math.BigDecimal;
import java.util.UUID;

public record DeliveryResponse(
    UUID id,
    UUID orderId,
    String vendorName,
    /**
     * Who the courier is handing this to, and how to reach them at the door.
     *
     * <p>A courier arriving with a bag had an address and no name — nothing to check a person
     * against, and no way to ring when the pin is thirty metres out. Null on pre-V15 orders.
     */
    String customerName,
    String customerPhone,
    String dropoffAddr,
    /**
     * The two ends of the job as coordinates, not just names.
     *
     * The courier app previously received an address string and nothing else, so its position
     * updates walked a path hardcoded into the app — the same stretch of central Accra whichever
     * restaurant the order came from. The customer therefore watched a courier who was nowhere
     * near their food. A courier needs pins, not prose.
     *
     * Dropoff is null on orders placed before the destination was stored.
     */
    BigDecimal vendorLat,
    BigDecimal vendorLng,
    BigDecimal dropoffLat,
    BigDecimal dropoffLng,
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
            o.getCustomerName(),
            o.getCustomerPhone(),
            o.getDeliveryAddr(),
            o.getRestaurant().getLat(),
            o.getRestaurant().getLng(),
            o.getDeliveryLat(),
            o.getDeliveryLng(),
            o.getTotal(),
            d.getStatus().name(),
            d.getCourierId(),
            o.getPaymentMethod(),
            o.getPaymentStatus().name()
        );
    }
}
