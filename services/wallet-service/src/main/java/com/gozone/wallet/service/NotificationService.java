package com.gozone.wallet.service;

import com.gozone.wallet.model.Notification;
import com.gozone.wallet.model.PushToken;
import com.gozone.wallet.repository.NotificationRepository;
import com.gozone.wallet.repository.PushTokenRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Sends REAL push notifications via Expo Push API.
 * On push failure, falls back to SMS stub (logged to console) and records the channel used.
 */
@Service
@Transactional
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final PushTokenRepository pushTokenRepo;
    private final NotificationRepository notificationRepo;
    private final WebClient webClient;

    @Value("${app.expo.push-url:https://exp.host/--/api/v2/push/send}")
    private String expoPushUrl;

    @Value("${app.expo.access-token:}")
    private String expoAccessToken;

    public NotificationService(PushTokenRepository pushTokenRepo,
                               NotificationRepository notificationRepo,
                               WebClient.Builder webClientBuilder) {
        this.pushTokenRepo    = pushTokenRepo;
        this.notificationRepo = notificationRepo;
        this.webClient        = webClientBuilder.build();
    }

    /** Register an Expo push token for a user. */
    public void registerPushToken(UUID userId, String token) {
        boolean exists = pushTokenRepo.findByUserId(userId)
            .stream().anyMatch(t -> t.getToken().equals(token));
        if (!exists) {
            PushToken pt = new PushToken();
            pt.setUserId(userId);
            pt.setToken(token);
            pushTokenRepo.save(pt);
            log.info("[PUSH] registered token userId={}", userId);
        }
    }

    /** Deregister a push token (e.g. on logout). */
    public void deregisterPushToken(UUID userId, String token) {
        pushTokenRepo.deleteByUserIdAndToken(userId, token);
    }

    /**
     * Send a push notification. Tries REAL Expo Push first; on failure falls back to SMS stub.
     */
    public void send(UUID userId, String title, String body) {
        List<PushToken> tokens = pushTokenRepo.findByUserId(userId);
        String channel = "SMS_STUB";
        boolean sent = false;

        for (PushToken pt : tokens) {
            try {
                sendExpoNotification(pt.getToken(), title, body);
                channel = "PUSH";
                sent = true;
                log.info("[PUSH] sent userId={} token={}…", userId, pt.getToken().substring(0, Math.min(15, pt.getToken().length())));
            } catch (Exception e) {
                log.warn("[PUSH] push failed for userId={} — falling back to SMS stub. reason={}", userId, e.getMessage());
            }
        }

        if (!sent) {
            // SMS stub: log only
            log.info("[SMS-STUB] userId={} title='{}' body='{}'", userId, title, body);
        }

        recordNotification(userId, title, body, channel, sent || !tokens.isEmpty());
    }

    @Transactional(readOnly = true)
    public List<Notification> getNotifications(UUID userId) {
        return notificationRepo.findByUserIdOrderByCreatedAtDesc(userId);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private void sendExpoNotification(String expoPushToken, String title, String body) {
        Map<String, Object> payload = Map.of(
            "to", expoPushToken,
            "title", title,
            "body", body,
            "sound", "default"
        );

        var spec = webClient.post()
            .uri(expoPushUrl)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(payload);

        if (!expoAccessToken.isBlank()) {
            spec = spec.header(HttpHeaders.AUTHORIZATION, "Bearer " + expoAccessToken);
        }

        spec.retrieve()
            .bodyToMono(String.class)
            .timeout(Duration.ofSeconds(5))
            .block(); // synchronous for simplicity; fire-and-forget variant can use subscribe()
    }

    private void recordNotification(UUID userId, String title, String body, String channel, boolean sent) {
        Notification notif = new Notification();
        notif.setUserId(userId);
        notif.setTitle(title);
        notif.setBody(body);
        notif.setChannel(channel);
        notif.setSent(sent);
        notificationRepo.save(notif);
    }
}
