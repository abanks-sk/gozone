package com.gozone.food.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

public class PlaceOrderRequest {

    @NotNull private UUID restaurantId;
    @NotBlank private String mode;  // DELIVERY | PICKUP | WALKIN
    private String deliveryAddr;    // required for DELIVERY

    @NotEmpty @Valid
    private List<LineItem> items;

    public UUID getRestaurantId() { return restaurantId; }
    public void setRestaurantId(UUID restaurantId) { this.restaurantId = restaurantId; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public String getDeliveryAddr() { return deliveryAddr; }
    public void setDeliveryAddr(String deliveryAddr) { this.deliveryAddr = deliveryAddr; }
    public List<LineItem> getItems() { return items; }
    public void setItems(List<LineItem> items) { this.items = items; }

    public static class LineItem {
        @NotNull private UUID menuItemId;
        private short qty = 1;
        public UUID getMenuItemId() { return menuItemId; }
        public void setMenuItemId(UUID menuItemId) { this.menuItemId = menuItemId; }
        public short getQty() { return qty; }
        public void setQty(short qty) { this.qty = qty; }
    }
}
