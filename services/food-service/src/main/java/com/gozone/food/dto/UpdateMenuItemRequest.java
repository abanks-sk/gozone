package com.gozone.food.dto;

import java.math.BigDecimal;

/** Vendor edits a catalogue item. Any field may be omitted to leave it unchanged. */
public class UpdateMenuItemRequest {
    private String name;
    private String description;
    private BigDecimal price;
    private Boolean available;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public Boolean getAvailable() { return available; }
    public void setAvailable(Boolean available) { this.available = available; }
}
