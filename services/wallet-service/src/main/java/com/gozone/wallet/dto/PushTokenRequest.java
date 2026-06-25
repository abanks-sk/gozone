package com.gozone.wallet.dto;

import jakarta.validation.constraints.NotBlank;

public class PushTokenRequest {
    @NotBlank private String token;

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
}
