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
    private Double deliveryLat;     // for distance-based delivery fee
    private Double deliveryLng;

    @NotEmpty @Valid
    private List<LineItem> items;

    public UUID getRestaurantId() { return restaurantId; }
    public void setRestaurantId(UUID restaurantId) { this.restaurantId = restaurantId; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public String getDeliveryAddr() { return deliveryAddr; }
    public void setDeliveryAddr(String deliveryAddr) { this.deliveryAddr = deliveryAddr; }
    public Double getDeliveryLat() { return deliveryLat; }
    public void setDeliveryLat(Double deliveryLat) { this.deliveryLat = deliveryLat; }
    public Double getDeliveryLng() { return deliveryLng; }
    public void setDeliveryLng(Double deliveryLng) { this.deliveryLng = deliveryLng; }
    public List<LineItem> getItems() { return items; }
    public void setItems(List<LineItem> items) { this.items = items; }

    public static class LineItem {
        @NotNull private UUID menuItemId;
        private short qty = 1;
        private List<UUID> addonOptionIds; // selected add-on option ids for this line
        public UUID getMenuItemId() { return menuItemId; }
        public void setMenuItemId(UUID menuItemId) { this.menuItemId = menuItemId; }
        public short getQty() { return qty; }
        public void setQty(short qty) { this.qty = qty; }
        public List<UUID> getAddonOptionIds() { return addonOptionIds; }
        public void setAddonOptionIds(List<UUID> addonOptionIds) { this.addonOptionIds = addonOptionIds; }
    }
}
