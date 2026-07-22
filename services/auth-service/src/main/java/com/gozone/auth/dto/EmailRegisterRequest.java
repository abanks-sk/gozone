package com.gozone.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Email sign-up: creates the account and issues an OTP to the email (logged in dev). */
public class EmailRegisterRequest {
    @NotBlank @Email
    private String email;

    @NotBlank
    private String role; // RIDER | DRIVER | RESTAURANT_OWNER | COURIER

    private String name;
    private String vehicleClass;

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getVehicleClass() { return vehicleClass; }
    public void setVehicleClass(String vehicleClass) { this.vehicleClass = vehicleClass; }
}
