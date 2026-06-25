package com.gozone.wallet.controller;

import com.gozone.wallet.dto.SendNotificationRequest;
import com.gozone.wallet.service.NotificationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * Internal notification dispatch endpoint.
 * Gateway rewrites /notify → /wallet/notify so this controller handles
 * both internal service calls and the public gateway route.
 */
@RestController
@RequestMapping("/notify")
public class NotifyController {

    private final NotificationService notificationService;

    public NotifyController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> notify(
            @Valid @RequestBody SendNotificationRequest req) {
        notificationService.send(req.getUserId(), req.getTitle(), req.getBody());
        return ResponseEntity.ok(Map.of(
            "notificationId", UUID.randomUUID().toString(),
            "status", "dispatched"
        ));
    }
}
