package com.gozone.ride.dto;

import java.util.UUID;

/**
 * What someone's ratings add up to.
 *
 * <p>{@code average} is the real mean of every rating, rounded to one decimal, and is <b>0 when
 * nobody has rated them</b> — never null. Every driver used to show a hardcoded 4.9, including one
 * who had never driven anybody. The first attempt at fixing that withheld the average below three
 * ratings and showed "New" instead, but that left a driver rated 4 once still displaying 4.9 from
 * a stale literal, and hiding a score you already hold is its own kind of dishonest. Zero means
 * unrated, and it is the client's job to say so rather than to invent a number.
 *
 * @param count how many ratings exist — 0 alongside an average of 0 means genuinely unrated
 */
public record RatingSummary(UUID userId, double average, long count) {}
