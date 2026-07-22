package com.gozone.ride.dto;

/**
 * Combined view a rider polls after creating a request:
 * the request's current status plus the matched trip (null until the rider
 * accepts a driver's offer) and the winning driver's details (from the
 * accepted bid) for the driver card on the live screen.
 */
public record RideStatusResponse(
    RideRequestResponse request,
    TripResponse trip,
    BidOffer driver
) {}
