package com.gozone.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sends OTP codes by SMS.
 *
 * Supports two providers, chosen with app.sms.provider:
 *   - "africastalking" — Africa-focused; username "sandbox" hits their free sandbox.
 *   - "twilio"         — trial credit delivers real SMS to a verified number.
 *
 * If nothing is configured (or a send fails) the code is logged instead, exactly like
 * before — so the demo keeps working offline and an SMS outage never blocks sign-in.
 */
@Service
public class SmsService {

    private static final Logger log = LoggerFactory.getLogger(SmsService.class);

    @Value("${app.sms.provider:africastalking}") private String provider;

    /**
     * Dev convenience: also log the code after a successful send, so a demo can proceed
     * even when the handset/simulator isn't reachable. MUST be false in production —
     * codes in logs defeat the purpose of an OTP.
     */
    @Value("${app.otp.log-codes:true}") private boolean logCodes;

    // Africa's Talking
    @Value("${app.sms.at.username:}")  private String atUsername;
    @Value("${app.sms.at.api-key:}")   private String atApiKey;
    @Value("${app.sms.at.sender-id:}") private String atSenderId;

    // Twilio
    @Value("${app.sms.twilio.account-sid:}") private String twilioSid;
    @Value("${app.sms.twilio.auth-token:}")  private String twilioToken;
    @Value("${app.sms.twilio.from:}")        private String twilioFrom;

    /**
     * Bounded HTTP client. A bare {@code new RestTemplate()} has NO connect or read
     * timeout, so an unresponsive SMS gateway blocks the calling thread forever — the
     * fail-soft catch below never fires and sign-in hangs instead of falling back to a
     * logged code. These timeouts are what make the fallback actually reachable.
     */
    private final RestTemplate rest = bounded();

    private static RestTemplate bounded() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout((int) Duration.ofSeconds(4).toMillis());
        f.setReadTimeout((int) Duration.ofSeconds(8).toMillis());
        return new RestTemplate(f);
    }

    /**
     * Sends happen off the request thread: signing in must never wait on a third-party
     * SMS gateway. The code is persisted before this runs, so the user can verify as
     * soon as the message arrives (or, in dev, as soon as it is logged).
     */
    private final ExecutorService dispatch = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "sms-dispatch");
        t.setDaemon(true);
        return t;
    });

    private boolean isTwilio() { return "twilio".equalsIgnoreCase(provider); }

    public boolean enabled() {
        return isTwilio()
            ? notBlank(twilioSid) && notBlank(twilioToken) && notBlank(twilioFrom)
            : notBlank(atUsername) && notBlank(atApiKey);
    }

    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }

    /** Send the OTP; falls back to logging it. */
    public void sendOtp(String phone, String code, int expiryMinutes) {
        String message = "Your GoZone verification code is " + code
            + ". It expires in " + expiryMinutes + " minutes.";

        if (!enabled()) {
            log.info("[OTP-MOCK] phone={} code={} expires_in={}m (SMS not configured)", phone, code, expiryMinutes);
            return;
        }

        // Surface the code immediately in dev — before any network call — so a slow or
        // failing provider can neither delay it nor hide it.
        if (logCodes) {
            log.info("[OTP-DEV] phone={} code={} (app.otp.log-codes=true — disable in production)", phone, code);
        }

        dispatch.submit(() -> {
            try {
                if (isTwilio()) sendViaTwilio(phone, message);
                else sendViaAfricasTalking(phone, message);
                log.info("[SMS] verification code sent to {} via {}", phone, provider);
            } catch (Exception e) {
                // Never block sign-in on an SMS failure — the code is already issued and
                // logged above, so the user can still proceed.
                log.error("[SMS] send to {} failed: {}", phone, e.getMessage());
                log.info("[OTP-MOCK] phone={} code={} expires_in={}m (send failed)", phone, code, expiryMinutes);
            }
        });
    }

    private void sendViaAfricasTalking(String phone, String message) {
        // "sandbox" username → their free sandbox host (simulator, not real handsets).
        String url = "sandbox".equalsIgnoreCase(atUsername)
            ? "https://api.sandbox.africastalking.com/version1/messaging"
            : "https://api.africastalking.com/version1/messaging";

        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        h.set("apiKey", atApiKey);
        h.setAccept(java.util.List.of(MediaType.APPLICATION_JSON));

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("username", atUsername);
        form.add("to", phone);
        form.add("message", message);
        if (notBlank(atSenderId)) form.add("from", atSenderId);

        rest.exchange(url, HttpMethod.POST, new HttpEntity<>(form, h), String.class);
    }

    private void sendViaTwilio(String phone, String message) {
        String url = "https://api.twilio.com/2010-04-01/Accounts/" + twilioSid + "/Messages.json";

        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        String basic = Base64.getEncoder()
            .encodeToString((twilioSid + ":" + twilioToken).getBytes(StandardCharsets.UTF_8));
        h.set(HttpHeaders.AUTHORIZATION, "Basic " + basic);

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("To", phone);
        form.add("From", twilioFrom);
        form.add("Body", message);

        rest.exchange(url, HttpMethod.POST, new HttpEntity<>(form, h), String.class);
    }
}
