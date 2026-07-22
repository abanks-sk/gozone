package com.gozone.ride.controller;

import com.gozone.ride.service.MapsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Maps proxy endpoints. Context-path is /rides, so these are /rides/maps/**.
 * Authenticated (any signed-in user); the Google server key never leaves the backend.
 */
@RestController
@RequestMapping("/maps")
public class MapsController {

    private final MapsService maps;

    public MapsController(MapsService maps) {
        this.maps = maps;
    }

    /** Road route between two points (decoded polyline + distance/duration). */
    @GetMapping("/directions")
    public ResponseEntity<Map<String, Object>> directions(
            @RequestParam double originLat, @RequestParam double originLng,
            @RequestParam double destLat, @RequestParam double destLng) {
        return ResponseEntity.ok(maps.directions(originLat, originLng, destLat, destLng));
    }

    /** Place search suggestions for a text query. */
    @GetMapping("/places/autocomplete")
    public ResponseEntity<List<Map<String, String>>> autocomplete(@RequestParam("q") String q) {
        return ResponseEntity.ok(maps.autocomplete(q));
    }

    /** Free-text place search → results with coordinates (used by the search screen). */
    @GetMapping("/places/search")
    public ResponseEntity<List<Map<String, Object>>> searchPlaces(@RequestParam("q") String q) {
        return ResponseEntity.ok(maps.searchPlaces(q));
    }

    /** Resolve a place id to coordinates + address. */
    @GetMapping("/places/details")
    public ResponseEntity<Map<String, Object>> details(@RequestParam String placeId) {
        return ResponseEntity.ok(maps.placeDetails(placeId));
    }

    /** Address at a coordinate. */
    @GetMapping("/geocode/reverse")
    public ResponseEntity<Map<String, Object>> reverse(@RequestParam double lat, @RequestParam double lng) {
        return ResponseEntity.ok(maps.reverseGeocode(lat, lng));
    }
}
