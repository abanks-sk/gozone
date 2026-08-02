package com.gozone.food.dto;

import com.gozone.food.model.Order;
import com.gozone.food.model.OrderItem;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record OrderResponse(
    UUID id,
    UUID customerId,
    UUID restaurantId,
    String restaurantName,
    String mode,
    String status,
    BigDecimal total,
    BigDecimal deliveryFee,
    BigDecimal serviceFee,
    BigDecimal discount,
    String promoLabel,
    String promoNotes,
    String deliveryAddr,
    /** Destination pin. Null for pickup/walk-in and for orders placed before it was stored. */
    BigDecimal deliveryLat,
    BigDecimal deliveryLng,
    /** Where the food is coming from — sent here so tracking needs no second call. */
    BigDecimal restaurantLat,
    BigDecimal restaurantLng,
    OffsetDateTime createdAt,
    String paymentStatus,
    String paymentMethod,
    List<ItemLine> items
) {
    public record ItemLine(UUID menuItemId, String name, short qty, BigDecimal unitPrice, List<Addon> addons) {}
    public record Addon(String label, BigDecimal price) {}

    public static OrderResponse from(Order o) {
        List<ItemLine> lines = o.getItems().stream()
            .map(i -> new ItemLine(
                i.getMenuItem().getId(),
                i.getMenuItem().getName(),
                i.getQty(),
                i.getUnitPrice(),
                i.getAddons().stream().map(a -> new Addon(a.getLabel(), a.getPrice())).toList()))
            .toList();
        return new OrderResponse(
            o.getId(),
            o.getCustomerId(),
            o.getRestaurant().getId(),
            o.getRestaurant().getName(),
            o.getMode().name(),
            o.getStatus().name(),
            o.getTotal(),
            o.getDeliveryFee(),
            o.getServiceFee(),
            o.getDiscount(),
            o.getPromoLabel(),
            o.getPromoNotes(),
            o.getDeliveryAddr(),
            o.getDeliveryLat(),
            o.getDeliveryLng(),
            o.getRestaurant().getLat(),
            o.getRestaurant().getLng(),
            o.getCreatedAt(),
            o.getPaymentStatus().name(),
            o.getPaymentMethod(),
            lines
        );
    }
}
