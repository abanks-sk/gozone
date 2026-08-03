package com.gozone.food.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

/** Vendor creates a catalogue item, optionally with add-on groups. */
public class CreateMenuItemRequest {
    @NotBlank private String name;
    private String description;
    private String category;
    @NotNull @DecimalMin("0.01") private BigDecimal price;
    private Boolean available = true;
    /** Photo of the dish, uploaded through the app. */
    private String imageUrl;
    private List<GroupInput> groups;

    public static class GroupInput {
        private String name;
        private boolean multi;
        private boolean required;
        private List<OptionInput> options;
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public boolean isMulti() { return multi; }
        public void setMulti(boolean multi) { this.multi = multi; }
        public boolean isRequired() { return required; }
        public void setRequired(boolean required) { this.required = required; }
        public List<OptionInput> getOptions() { return options; }
        public void setOptions(List<OptionInput> options) { this.options = options; }
    }

    public static class OptionInput {
        private String label;
        private BigDecimal price;
        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }
        public BigDecimal getPrice() { return price; }
        public void setPrice(BigDecimal price) { this.price = price; }
    }

    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
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
    public List<GroupInput> getGroups() { return groups; }
    public void setGroups(List<GroupInput> groups) { this.groups = groups; }

    /** Minutes to prepare this dish. Null leaves it unset and the vendor's flat time applies. */
    private Integer prepMinutes;
    public Integer getPrepMinutes() { return prepMinutes; }
    public void setPrepMinutes(Integer prepMinutes) { this.prepMinutes = prepMinutes; }
}
