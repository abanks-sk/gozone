package com.gozone.ride.controller;

import com.gozone.ride.dto.*;
import com.gozone.ride.service.RideService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

    // ── Ride Requests ─────────────────────────────────────────────────────────

    @PostMapping("/requests")
    public ResponseEntity<RideRequestResponse> createRequest(
            @AuthenticationPrincipal String riderId,
            @Valid @RequestBody CreateRideRequestDto dto) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(rideService.createRequest(riderId, dto));
    }

    @GetMapping("/requests/nearby")
    public ResponseEntity<List<RideRequestResponse>> nearbyRequests(
            @RequestParam double lat,
            @RequestParam double lng,
            @RequestParam(defaultValue = "5") double radiusKm) {
        return ResponseEntity.ok(rideService.nearbyRequests(lat, lng, radiusKm));
    }

    @PostMapping("/requests/{id}/bid")
    public ResponseEntity<BidResponse> placeBid(
            @PathVariable UUID id,
            @AuthenticationPrincipal String driverId,
            @Valid @RequestBody BidRequestDto dto) {
        return ResponseEntity.ok(rideService.placeBid(id, driverId, dto));
    }

    // ── Trips ─────────────────────────────────────────────────────────────────

    @PatchMapping("/trips/{id}/status")
    public ResponseEntity<TripResponse> updateTripStatus(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId,
            @Valid @RequestBody TripStatusUpdateDto dto) {
        return ResponseEntity.ok(rideService.updateTripStatus(id, userId, dto));
    }

    // ── Pooling ───────────────────────────────────────────────────────────────

    @PostMapping("/trips/{id}/pool-candidates")
    public ResponseEntity<List<RideRequestResponse>> poolCandidates(@PathVariable UUID id) {
        return ResponseEntity.ok(rideService.poolCandidates(id));
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

    // ── SOS (stub) ────────────────────────────────────────────────────────────

    @PostMapping("/trips/{id}/sos")
    public ResponseEntity<Map<String, String>> sos(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId) {
        rideService.sos(id, userId);
        return ResponseEntity.ok(Map.of("status", "logged", "message", "SOS recorded"));
    }

    // ── Health / legacy ping ──────────────────────────────────────────────────

    @GetMapping("/ping")
    public ResponseEntity<Map<String, String>> ping(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(Map.of("service", "ride-service", "status", "ok"));
    }
}
