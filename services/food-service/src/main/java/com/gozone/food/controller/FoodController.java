package com.gozone.food.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Skeleton controller — satisfies M1 gate (one authenticated endpoint per service).
 * Full food endpoints are built in M4.
 */
@RestController
public class FoodController {

    @GetMapping("/ping")
    public ResponseEntity<Map<String, String>> ping(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(Map.of(
            "service", "food-service",
            "status", "ok",
            "userId", userId != null ? userId : "anonymous"
        ));
    }
}
