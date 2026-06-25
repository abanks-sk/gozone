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
    String deliveryAddr,
    OffsetDateTime createdAt,
    List<ItemLine> items
) {
    public record ItemLine(UUID menuItemId, String name, short qty, BigDecimal unitPrice) {}

    public static OrderResponse from(Order o) {
        List<ItemLine> lines = o.getItems().stream()
            .map(i -> new ItemLine(
                i.getMenuItem().getId(),
                i.getMenuItem().getName(),
                i.getQty(),
                i.getUnitPrice()))
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
            o.getDeliveryAddr(),
            o.getCreatedAt(),
            lines
        );
    }
}
