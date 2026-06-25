package com.gozone.wallet.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * Notification endpoint — stub that logs the event.
 * Full Expo push + SMS implementation is built in M5.
 * Gateway rewrites /notify → /wallet/notify so this controller
 * handles both internal service calls and external /notify requests.
 */
@RestController
@RequestMapping("/notify")
public class NotifyController {

    private static final Logger log = LoggerFactory.getLogger(NotifyController.class);

    @PostMapping
    public ResponseEntity<Map<String, Object>> notify(@RequestBody Map<String, Object> payload) {
        log.info("[NOTIFY-STUB] {}", payload);
        return ResponseEntity.ok(Map.of(
            "notificationId", UUID.randomUUID().toString(),
            "channel", "PUSH",
            "status", "SENT"
        ));
    }
}
