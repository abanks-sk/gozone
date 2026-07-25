package com.gozone.auth.dto;

import jakarta.validation.constraints.Size;

/**
 * Profile edit from the account screen. Only the free-text fields live here —
 * phone and email are login credentials and change through their own
 * verify-by-code flows (/me/phone, /me/email).
 *
 * A null field means "leave unchanged"; a blank one is rejected.
 */
public class UpdateProfileRequest {

    @Size(max = 100, message = "Name is too long.")
    private String name;

    @Size(max = 30, message = "Username is too long.")
    private String username;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
}
