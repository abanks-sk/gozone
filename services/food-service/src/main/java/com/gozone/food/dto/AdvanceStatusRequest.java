package com.gozone.food.dto;

import jakarta.validation.constraints.NotBlank;

public class AdvanceStatusRequest {
    @NotBlank private String status;

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
