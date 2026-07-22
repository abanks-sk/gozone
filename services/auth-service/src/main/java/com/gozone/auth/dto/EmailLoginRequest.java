package com.gozone.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Email login: OTP is issued only if this email already has an account. */
public class EmailLoginRequest {
    @NotBlank @Email
    private String email;

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
}
