package com.gozone.ride.dto;

import jakarta.validation.constraints.NotBlank;

public class TripStatusUpdateDto {
    @NotBlank private String status; // ENROUTE | STARTED | COMPLETED | CANCELLED

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
