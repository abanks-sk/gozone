package com.gozone.ride.controller;

import com.gozone.ride.dto.*;
import com.gozone.ride.service.RideService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Ride endpoints. Context-path is /rides, so paths here have no /rides prefix.
 */
@RestController
public class RideController {

    private final RideService rideService;

    public RideController(RideService rideService) {
        this.rideService = rideService;
    }

    // ── Pricing ───────────────────────────────────────────────────────────────

    @PostMapping("/quote")
    public ResponseEntity<QuoteResponse> quote(@Valid @RequestBody QuoteRequestDto dto) {
        return ResponseEntity.ok(rideService.quote(dto));
    }

    // ── Ride Requests ─────────────────────────────────────────────────────────

    @PostMapping("/requests")
    public ResponseEntity<RideRequestResponse> createRequest(
            @AuthenticationPrincipal String riderId,
            @Valid @RequestBody CreateRideRequestDto dto) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(rideService.createRequest(riderId, dto));
    }

    @GetMapping("/requests/nearby")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER') and hasAuthority('STATUS_ACTIVE')")
    public ResponseEntity<List<RideRequestResponse>> nearbyRequests(
            @RequestParam double lat,
            @RequestParam double lng,
            @RequestParam(defaultValue = "5") double radiusKm,
            @RequestParam(required = false) String vehicleClass,
            @RequestParam(required = false) String serviceMode) {
        return ResponseEntity.ok(rideService.nearbyRequests(lat, lng, radiusKm, vehicleClass, serviceMode));
    }

    @GetMapping("/requests/{id}/status")
    public ResponseEntity<RideStatusResponse> requestStatus(
            @PathVariable UUID id,
            @AuthenticationPrincipal String riderId) {
        return ResponseEntity.ok(rideService.getRequestStatus(id, riderId));
    }

    @GetMapping("/trips/mine")
    public ResponseEntity<List<RideHistoryItem>> myRides(@AuthenticationPrincipal String riderId) {
        return ResponseEntity.ok(rideService.myRides(riderId));
    }

    @PostMapping("/requests/{id}/bid")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER') and hasAuthority('STATUS_ACTIVE')")
    public ResponseEntity<BidResponse> placeBid(
            @PathVariable UUID id,
            @AuthenticationPrincipal String driverId,
            @Valid @RequestBody BidRequestDto dto) {
        return ResponseEntity.ok(rideService.placeBid(id, driverId, dto));
    }

    /** Driver polls their own offer while the rider decides. */
    @GetMapping("/bids/{id}")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER')")
    public ResponseEntity<BidStatusResponse> bidStatus(
            @PathVariable UUID id,
            @AuthenticationPrincipal String driverId) {
        return ResponseEntity.ok(rideService.getBidStatus(id, driverId));
    }

    /** Driver withdraws their pending offer. */
    @DeleteMapping("/bids/{id}")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER')")
    public ResponseEntity<Void> withdrawBid(
            @PathVariable UUID id,
            @AuthenticationPrincipal String driverId) {
        rideService.withdrawBid(id, driverId);
        return ResponseEntity.noContent().build();
    }

    // ── Bargaining: rider views & accepts driver offers ───────────────────────

    @GetMapping("/requests/{id}/bids")
    public ResponseEntity<List<BidOffer>> listBids(
            @PathVariable UUID id,
            @AuthenticationPrincipal String riderId) {
        return ResponseEntity.ok(rideService.listBids(id, riderId));
    }

    @PostMapping("/requests/{id}/bids/{bidId}/accept")
    public ResponseEntity<TripResponse> acceptBid(
            @PathVariable UUID id,
            @PathVariable UUID bidId,
            @AuthenticationPrincipal String riderId) {
        return ResponseEntity.ok(rideService.acceptBid(id, bidId, riderId));
    }

    // ── Trips ─────────────────────────────────────────────────────────────────

    @PatchMapping("/trips/{id}/status")
    public ResponseEntity<TripResponse> updateTripStatus(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId,
            @Valid @RequestBody TripStatusUpdateDto dto) {
        return ResponseEntity.ok(rideService.updateTripStatus(id, userId, dto));
    }

    // ── Payment ───────────────────────────────────────────────────────────────

    @GetMapping("/trips/{id}")
    public ResponseEntity<TripResponse> getTrip(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(rideService.getTrip(id, userId));
    }

    @PostMapping("/trips/{id}/pay")
    public ResponseEntity<TripResponse> pay(
            @PathVariable UUID id,
            @AuthenticationPrincipal String riderId,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(rideService.payTrip(
            id, riderId, body.getOrDefault("method", "wallet"), body.get("reference")));
    }

    /** Driver has reached the pickup point — pushes a notification to the customer. */
    @PostMapping("/trips/{id}/arrived")
    public ResponseEntity<TripResponse> arrived(
            @PathVariable UUID id,
            @AuthenticationPrincipal String driverId) {
        return ResponseEntity.ok(rideService.driverArrived(id, driverId));
    }

    /**
     * Driver confirms cash. An optional {@code riderId} in the body names which passenger paid —
     * needed on a shared ride, where two people owe two different amounts.
     */
    @PostMapping("/trips/{id}/confirm-cash")
    public ResponseEntity<TripResponse> confirmCash(
            @PathVariable UUID id,
            @AuthenticationPrincipal String driverId,
            @RequestBody(required = false) Map<String, String> body) {
        String rider = body != null ? body.get("riderId") : null;
        return ResponseEntity.ok(rideService.confirmCash(id, driverId,
            rider != null && !rider.isBlank() ? UUID.fromString(rider) : null));
    }

    // ── Ride sharing (pooling) ────────────────────────────────────────────────

    /**
     * Shared rides already on the road that this request could join.
     *
     * <p>Polled by the rider alongside driver offers while they wait, so the two appear together
     * as alternatives. Empty whenever nothing is going their way, which is the ordinary case.
     */
    @GetMapping("/requests/{id}/pool-offers")
    public ResponseEntity<List<PoolOffer>> poolOffers(
            @PathVariable UUID id,
            @AuthenticationPrincipal String riderId) {
        return ResponseEntity.ok(rideService.poolOffers(id, riderId));
    }

    /** The rider steps into a shared ride already under way. */
    @PostMapping("/trips/{id}/pool-join")
    public ResponseEntity<PoolJoinResponse> poolJoin(
            @PathVariable UUID id,
            @AuthenticationPrincipal String riderId,
            @Valid @RequestBody PoolJoinRequest req) {
        return ResponseEntity.ok(rideService.poolJoin(id, riderId, req));
    }

    /**
     * Driver confirms a passenger is in the car.
     *
     * <p>Only needed for people who joined en route — the passenger who booked is stamped when the
     * trip goes STARTED. It closes their exit: after this they owe the fare.
     */
    @PostMapping("/trips/{id}/passengers/{riderId}/picked-up")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER')")
    public ResponseEntity<TripPassengerResponse> markPickedUp(
            @PathVariable UUID id,
            @PathVariable UUID riderId,
            @AuthenticationPrincipal String driverId) {
        return ResponseEntity.ok(rideService.markPickedUp(id, driverId, riderId));
    }

    /**
     * Driver takes back a pickup confirmed by mistake, re-opening that passenger's exit.
     *
     * <p>DELETE on the same resource the POST creates. Time-boxed — a mis-tap is noticed in
     * seconds, and an open-ended undo would give back the fare protection it exists to provide.
     */
    @DeleteMapping("/trips/{id}/passengers/{riderId}/picked-up")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER')")
    public ResponseEntity<TripPassengerResponse> undoPickup(
            @PathVariable UUID id,
            @PathVariable UUID riderId,
            @AuthenticationPrincipal String driverId) {
        return ResponseEntity.ok(rideService.undoPickup(id, driverId, riderId));
    }

    /**
     * Passenger says they are not in that car.
     *
     * <p>Does not un-board them — that would let somebody ride the whole way and object at the
     * drop-off. It records the objection and tells the driver, who can undo it in one tap and, once
     * a dispute is open, is no longer bound by the usual undo window.
     */
    @PostMapping("/trips/{id}/dispute-pickup")
    public ResponseEntity<TripPassengerResponse> disputePickup(
            @PathVariable UUID id,
            @AuthenticationPrincipal String riderId,
            @RequestBody(required = false) Map<String, String> body) {
        return ResponseEntity.ok(rideService.disputePickup(id, riderId,
            body != null ? body.get("note") : null));
    }

    /** Admin: pickup disputes — the backstop when a driver won't correct one. */
    @GetMapping("/pickup-disputes")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<List<PickupDisputeResponse>> pickupDisputes(
            @RequestParam(defaultValue = "true") boolean openOnly) {
        return ResponseEntity.ok(rideService.listPickupDisputes(openOnly));
    }

    /**
     * Admin settles a dispute: uphold it (the passenger comes off the ride) or refuse it (they
     * stay on). A refusal must carry a reason — the passenger reads it.
     */
    @PatchMapping("/pickup-disputes/{tripId}/{riderId}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<PickupDisputeResponse> resolvePickupDispute(
            @PathVariable UUID tripId,
            @PathVariable UUID riderId,
            @RequestBody Map<String, String> body) {
        boolean uphold = "UPHELD".equalsIgnoreCase(body.getOrDefault("decision", ""));
        return ResponseEntity.ok(
            rideService.resolvePickupDispute(tripId, riderId, uphold, body.get("note")));
    }

    /**
     * A joiner gets out of a shared ride.
     *
     * <p>Not the same as cancelling: cancelling ends the trip and only the passenger who booked it
     * may do that. This drops one seat and re-prices whoever is left.
     */
    @PostMapping("/trips/{id}/leave-pool")
    public ResponseEntity<Void> leavePool(
            @PathVariable UUID id,
            @AuthenticationPrincipal String riderId) {
        rideService.leavePool(id, riderId);
        return ResponseEntity.noContent().build();
    }

    /** Everyone on a trip: the driver's pickup list, or who a passenger is sharing with. */
    @GetMapping("/trips/{id}/passengers")
    public ResponseEntity<List<TripPassengerResponse>> tripPassengers(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(rideService.tripPassengers(id, userId));
    }

    /** The other direction: open requests this driver could pick up along their route. */
    @PostMapping("/trips/{id}/pool-candidates")
    public ResponseEntity<List<RideRequestResponse>> poolCandidates(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(rideService.poolCandidates(id, userId));
    }

    // ── Location ──────────────────────────────────────────────────────────────

    @PostMapping("/locations")
    public ResponseEntity<Void> pushLocation(
            @AuthenticationPrincipal String driverId,
            @Valid @RequestBody LocationUpdateDto dto) {
        rideService.pushLocation(driverId, dto);
        return ResponseEntity.noContent().build();
    }

    // ── Ratings ───────────────────────────────────────────────────────────────

    /** The caller's own rating — what the driver app shows them about themselves. */
    @GetMapping("/ratings/me")
    public ResponseEntity<RatingSummary> myRating(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(rideService.ratingFor(UUID.fromString(userId)));
    }

    /**
     * Somebody else's rating — a passenger comparing the drivers who have offered.
     *
     * Signed-in callers only. A driver's rating is the thing a rider is meant to choose on, so it
     * is not private; the average is all that comes back, never who said what.
     */
    @GetMapping("/ratings/{userId}")
    public ResponseEntity<RatingSummary> ratingOf(@PathVariable UUID userId) {
        return ResponseEntity.ok(rideService.ratingFor(userId));
    }

    @PostMapping("/trips/{id}/rate")
    public ResponseEntity<Map<String, String>> rateTrip(
            @PathVariable UUID id,
            @AuthenticationPrincipal String raterId,
            @Valid @RequestBody RatingRequestDto dto) {
        rideService.rateTrip(id, raterId, dto);
        return ResponseEntity.ok(Map.of("status", "rated"));
    }

    // ── SOS → admin incident board ────────────────────────────────────────────

    @PostMapping("/trips/{id}/sos")
    public ResponseEntity<SosIncidentResponse> sos(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId,
            @RequestBody(required = false) Map<String, Double> body) {
        Double lat = body != null ? body.get("lat") : null;
        Double lng = body != null ? body.get("lng") : null;
        return ResponseEntity.ok(rideService.sos(id, userId, lat, lng));
    }

    @GetMapping("/sos")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<List<SosIncidentResponse>> listSos() {
        return ResponseEntity.ok(rideService.listSosIncidents());
    }

    @PatchMapping("/sos/{id}/handle")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<SosIncidentResponse> handleSos(@PathVariable UUID id) {
        return ResponseEntity.ok(rideService.handleSosIncident(id));
    }

    // ── Health / legacy ping ──────────────────────────────────────────────────

    @GetMapping("/ping")
    public ResponseEntity<Map<String, String>> ping(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(Map.of("service", "ride-service", "status", "ok"));
    }
}
