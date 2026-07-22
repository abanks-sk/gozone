package com.gozone.auth.dto;

import jakarta.validation.constraints.NotBlank;

/** Verify an OTP by phone OR email (exactly one identifier is provided by the client). */
public class VerifyOtpRequest {
    private String phone;
    private String email;
    @NotBlank private String code;

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
}
