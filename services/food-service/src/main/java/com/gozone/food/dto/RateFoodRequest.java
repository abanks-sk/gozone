package com.gozone.food.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public class RateFoodRequest {
    @NotNull @Min(1) @Max(5) private Short score;
    private String comment;

    public Short getScore() { return score; }
    public void setScore(Short score) { this.score = score; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
}
