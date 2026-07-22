package com.gozone.wallet.controller;

import com.gozone.wallet.dto.SendNotificationRequest;
import com.gozone.wallet.service.NotificationService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.UUID;

/**
 * Internal notification dispatch endpoint. It targets an arbitrary user, so it must NOT be
 * callable by end users — it's guarded by an X-Internal-Key header (service-to-service only).
 */
@RestController
@RequestMapping("/notify")
public class NotifyController {

    private final NotificationService notificationService;

    @Value("${app.internal.key}")   // required — no default; must match the shared INTERNAL_KEY
    private String internalKey;

    public NotifyController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> notify(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @Valid @RequestBody SendNotificationRequest req) {
        if (key == null || !key.equals(internalKey)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Internal dispatch only");
        }
        notificationService.send(req.getUserId(), req.getTitle(), req.getBody());
        return ResponseEntity.ok(Map.of(
            "notificationId", UUID.randomUUID().toString(),
            "status", "dispatched"
        ));
    }
}
