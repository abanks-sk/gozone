package com.gozone.auth.dto;

import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;

public class KycReviewRequest {
    @NotBlank
    private String status; // VERIFIED | REJECTED

    private LocalDate expiryDate;

    /** Why. Required on a rejection — the driver is shown it, so it has to say what to change. */
    private String note;

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDate getExpiryDate() { return expiryDate; }
    public void setExpiryDate(LocalDate expiryDate) { this.expiryDate = expiryDate; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
