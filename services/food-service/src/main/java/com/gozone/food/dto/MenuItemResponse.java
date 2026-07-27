package com.gozone.food.dto;

import com.gozone.food.model.MenuItem;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record MenuItemResponse(
    UUID id, String name, String description, String category, BigDecimal price, boolean available,
    Integer prepMinutes, List<Group> groups
) {
    public record Group(UUID id, String name, boolean multi, boolean required, List<Option> options) {}
    public record Option(UUID id, String label, BigDecimal price) {}

    public static MenuItemResponse from(MenuItem m) {
        List<Group> groups = m.getGroups().stream()
            .map(g -> new Group(
                g.getId(), g.getName(), g.isMulti(), g.isRequired(),
                g.getOptions().stream().map(o -> new Option(o.getId(), o.getLabel(), o.getPrice())).toList()))
            .toList();
        return new MenuItemResponse(m.getId(), m.getName(), m.getDescription(), m.getCategory(),
            m.getPrice(), m.isAvailable(), m.getPrepMinutes(), groups);
    }
}
