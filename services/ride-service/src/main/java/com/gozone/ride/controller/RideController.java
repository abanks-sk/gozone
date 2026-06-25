package com.gozone.ride.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Skeleton controller — satisfies M1 gate (one authenticated endpoint per service).
 * Full ride endpoints are built in M3.
 */
@RestController
public class RideController {

    @GetMapping("/ping")
    public ResponseEntity<Map<String, String>> ping(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(Map.of(
            "service", "ride-service",
            "status", "ok",
            "userId", userId != null ? userId : "anonymous"
        ));
    }
}
