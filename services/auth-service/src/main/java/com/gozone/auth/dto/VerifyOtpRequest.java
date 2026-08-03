package com.gozone.auth.dto;

import jakarta.validation.constraints.NotBlank;

/** Verify an OTP by phone OR email (exactly one identifier is provided by the client). */
public class VerifyOtpRequest {
    private String phone;

    /**
     * Which app is asking: PASSENGER | DRIVER | VENDOR. Identity is scoped to it, so the same
     * number can hold a separate account in each. Optional — omitted, the server infers it (from
     * the role on sign-up, or from the one account that matches on sign-in).
     */
    private String app;
    private String email;
    @NotBlank private String code;

    public String getApp() { return app; }
    public void setApp(String app) { this.app = app; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
}
