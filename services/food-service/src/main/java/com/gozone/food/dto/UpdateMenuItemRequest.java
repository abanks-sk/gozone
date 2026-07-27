package com.gozone.food.dto;

import java.math.BigDecimal;

/** Vendor edits a catalogue item. Any field may be omitted to leave it unchanged. */
public class UpdateMenuItemRequest {
    private String name;
    private String description;
    private String category;
    private BigDecimal price;
    private Boolean available;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public Boolean getAvailable() { return available; }
    public void setAvailable(Boolean available) { this.available = available; }

    /** Minutes to prepare this dish. Null leaves it unset and the vendor's flat time applies. */
    private Integer prepMinutes;
    public Integer getPrepMinutes() { return prepMinutes; }
    public void setPrepMinutes(Integer prepMinutes) { this.prepMinutes = prepMinutes; }
}
