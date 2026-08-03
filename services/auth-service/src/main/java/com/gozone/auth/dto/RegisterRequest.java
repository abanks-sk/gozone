package com.gozone.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class RegisterRequest {
    @NotBlank
    @Pattern(regexp = "^\\+?[0-9]{9,15}$", message = "Invalid phone number")
    private String phone;

    /**
     * Which app is asking: PASSENGER | DRIVER | VENDOR. Identity is scoped to it, so the same
     * number can hold a separate account in each. Optional — omitted, the server infers it (from
     * the role on sign-up, or from the one account that matches on sign-in).
     */
    private String app;

    @NotBlank
    private String role; // RIDER | DRIVER | RESTAURANT_OWNER | COURIER | ADMIN

    /** Display name — sent on first-time sign-up; ignored for an existing phone. */
    private String name;

    /** Chosen at sign-up; must be unique across all accounts. */
    private String username;

    /** Driver's self-selected vehicle class: OKADA or CARGO (a car is omitted → admin sets the tier). */
    private String vehicleClass;

    /** The vehicle itself, collected at sign-up. Ignored for non-driver roles. */
    private String vehicleMake;
    private String vehicleModel;
    private String vehicleColour;
    private String vehiclePlate;

    public String getApp() { return app; }
    public void setApp(String app) { this.app = app; }
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
    public String getVehicleMake() { return vehicleMake; }
    public void setVehicleMake(String vehicleMake) { this.vehicleMake = vehicleMake; }
    public String getVehicleModel() { return vehicleModel; }
    public void setVehicleModel(String vehicleModel) { this.vehicleModel = vehicleModel; }
    public String getVehicleColour() { return vehicleColour; }
    public void setVehicleColour(String vehicleColour) { this.vehicleColour = vehicleColour; }
    public String getVehiclePlate() { return vehiclePlate; }
    public void setVehiclePlate(String vehiclePlate) { this.vehiclePlate = vehiclePlate; }
}
