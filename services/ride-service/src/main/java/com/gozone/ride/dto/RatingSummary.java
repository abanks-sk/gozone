package com.gozone.ride.dto;

import java.util.UUID;

/**
 * What someone's ratings add up to.
 *
 * <p>{@code average} is deliberately null until enough people have rated them. Every driver in the
 * app used to show a hardcoded 4.9 — including one who had never driven anybody — and the honest
 * alternative to a made-up number is not a real number computed from two ratings. One bad night
 * would put a new driver on 1.0 and end them; "New driver" is both truer and fairer, and the client
 * shows that whenever this is null.
 *
 * @param count how many ratings exist, whether or not they are enough to average
 */
public record RatingSummary(UUID userId, Double average, long count) {}
