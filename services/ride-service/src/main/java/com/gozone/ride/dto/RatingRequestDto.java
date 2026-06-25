package com.gozone.ride.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public class RatingRequestDto {
    @NotNull private UUID rateeId;
    @NotNull @Min(1) @Max(5) private Short score;
    private String comment;

    public UUID getRateeId() { return rateeId; }
    public void setRateeId(UUID rateeId) { this.rateeId = rateeId; }
    public Short getScore() { return score; }
    public void setScore(Short score) { this.score = score; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
}
