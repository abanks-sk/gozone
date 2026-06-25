package com.gozone.food.dto;

import com.gozone.food.model.MenuItem;

import java.math.BigDecimal;
import java.util.UUID;

public record MenuItemResponse(UUID id, String name, BigDecimal price, boolean available) {
    public static MenuItemResponse from(MenuItem m) {
        return new MenuItemResponse(m.getId(), m.getName(), m.getPrice(), m.isAvailable());
    }
}
