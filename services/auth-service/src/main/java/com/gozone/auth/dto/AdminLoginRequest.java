package com.gozone.auth.dto;

import jakarta.validation.constraints.NotBlank;

/** Admin step 1: username + password. On success an OTP is sent to the phone on file. */
public class AdminLoginRequest {
    @NotBlank private String username;
    @NotBlank private String password;

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
