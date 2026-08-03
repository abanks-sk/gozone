package com.gozone.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Email sign-up: creates the account and issues an OTP to the email (logged in dev). */
public class EmailRegisterRequest {
    @NotBlank @Email
    private String email;

    /**
     * Which app is asking: PASSENGER | DRIVER | VENDOR. Identity is scoped to it, so the same
     * number can hold a separate account in each. Optional — omitted, the server infers it (from
     * the role on sign-up, or from the one account that matches on sign-in).
     */
    private String app;

    @NotBlank
    private String role; // RIDER | DRIVER | RESTAURANT_OWNER | COURIER

    private String name;
    private String vehicleClass;

    public String getApp() { return app; }
    public void setApp(String app) { this.app = app; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getVehicleClass() { return vehicleClass; }
    public void setVehicleClass(String vehicleClass) { this.vehicleClass = vehicleClass; }
}
