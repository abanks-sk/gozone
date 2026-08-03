package com.gozone.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** Login (phone-only): OTP is issued only if this phone already has an account. */
public class LoginRequest {
    @NotBlank
    @Pattern(regexp = "^\\+?[0-9]{9,15}$", message = "Invalid phone number")
    private String phone;

    /**
     * Which app is asking: PASSENGER | DRIVER | VENDOR. Identity is scoped to it, so the same
     * number can hold a separate account in each. Optional — omitted, the server infers it (from
     * the role on sign-up, or from the one account that matches on sign-in).
     */
    private String app;

    public String getApp() { return app; }
    public void setApp(String app) { this.app = app; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
}
