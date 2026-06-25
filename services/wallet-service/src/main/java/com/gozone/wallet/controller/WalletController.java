package com.gozone.wallet.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Skeleton controller — satisfies M1 gate (one authenticated endpoint per service).
 * Full wallet endpoints are built in M5.
 */
@RestController
public class WalletController {

    @GetMapping("/ping")
    public ResponseEntity<Map<String, String>> ping(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(Map.of(
            "service", "wallet-service",
            "status", "ok",
            "userId", userId != null ? userId : "anonymous"
        ));
    }
}
