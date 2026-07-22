package com.gozone.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class RegisterRequest {
    @NotBlank
    @Pattern(regexp = "^\\+?[0-9]{9,15}$", message = "Invalid phone number")
    private String phone;

    @NotBlank
    private String role; // RIDER | DRIVER | RESTAURANT_OWNER | COURIER | ADMIN

    /** Display name — sent on first-time sign-up; ignored for an existing phone. */
    private String name;

    /** Chosen at sign-up; must be unique across all accounts. */
    private String username;

    /** Driver's self-selected vehicle class: OKADA or CARGO (a car is omitted → admin sets the tier). */
    private String vehicleClass;

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getVehicleClass() { return vehicleClass; }
    public void setVehicleClass(String vehicleClass) { this.vehicleClass = vehicleClass; }
}
