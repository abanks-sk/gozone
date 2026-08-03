package com.gozone.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Email login: OTP is issued only if this email already has an account. */
public class EmailLoginRequest {
    @NotBlank @Email
    private String email;

    /**
     * Which app is asking: PASSENGER | DRIVER | VENDOR. Identity is scoped to it, so the same
     * number can hold a separate account in each. Optional — omitted, the server infers it (from
     * the role on sign-up, or from the one account that matches on sign-in).
     */
    private String app;

    public String getApp() { return app; }
    public void setApp(String app) { this.app = app; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
}
