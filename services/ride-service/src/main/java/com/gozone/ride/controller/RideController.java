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

    @PostMapping("/trips/{id}/confirm-cash")
    public ResponseEntity<TripResponse> confirmCash(
            @PathVariable UUID id,
            @AuthenticationPrincipal String driverId) {
        return ResponseEntity.ok(rideService.confirmCash(id, driverId));
    }

    // ── Pooling ───────────────────────────────────────────────────────────────

    @PostMapping("/trips/{id}/pool-candidates")
    public ResponseEntity<List<RideRequestResponse>> poolCandidates(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(rideService.poolCandidates(id, userId));
    }

    @PostMapping("/trips/{id}/pool-join")
    public ResponseEntity<PoolJoinResponse> poolJoin(
            @PathVariable UUID id,
            @AuthenticationPrincipal String riderId,
            @Valid @RequestBody PoolJoinRequest req) {
        return ResponseEntity.ok(rideService.poolJoin(id, riderId, req));
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
