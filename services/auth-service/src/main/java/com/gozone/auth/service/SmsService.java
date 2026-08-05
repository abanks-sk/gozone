package com.gozone.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sends OTP codes by SMS through Termii.
 *
 * <p>Termii replaced Africa's Talking and Twilio; both are gone rather than left switchable,
 * because a provider nobody has credentials for is dead code that still has to be read and
 * reasoned about every time this file is opened.
 *
 * <p><b>The code is always logged.</b> See {@link #logCodes} — this is deliberate and temporary,
 * and the reason is written there.
 */
@Service
public class SmsService {

    private static final Logger log = LoggerFactory.getLogger(SmsService.class);

    /**
     * Write every OTP to the service log.
     *
     * <p>⚠️ <b>This is a way in.</b> Anyone who can read the logs can sign in as anyone, because
     * the code is the only thing standing between a phone number and a session. It defaults to
     * <b>true</b> and is intended to stay true through the demo, on purpose: Termii will not
     * deliver a message until the sender ID is approved, which takes days that this project does
     * not have. Without the log there would be no way to sign in at all once the stack is hosted.
     *
     * <p>Set {@code OTP_LOG_CODES=false} the moment Termii is approved. Until then, treat access
     * to the logs as equivalent to access to every account.
     */
    @Value("${app.otp.log-codes:true}") private boolean logCodes;

    // ── Arkesel, the primary ─────────────────────────────────────────────────
    // Ghana-based, so Ghanaian numbers route domestically rather than as international
    // traffic — which is both cheaper and far more likely to actually arrive.
    @Value("${app.sms.arkesel.api-key:}") private String arkeselKey;
    /** Alphanumeric sender, max 11 characters. Arkesel rejects anything longer. */
    @Value("${app.sms.arkesel.sender:GoZone}") private String arkeselSender;
    @Value("${app.sms.arkesel.base-url:https://sms.arkesel.com}") private String arkeselBaseUrl;

    @Value("${app.sms.termii.api-key:}")   private String apiKey;
    /** The registered sender ID. Termii rejects a send using one it has not approved. */
    @Value("${app.sms.termii.sender-id:GoZone}") private String senderId;
    /** "generic" is the ordinary route; "dnd" reaches numbers on do-not-disturb lists. */
    @Value("${app.sms.termii.channel:generic}")  private String channel;
    @Value("${app.sms.termii.base-url:https://api.ng.termii.com}") private String baseUrl;

    // ── Brevo, the fallback ──────────────────────────────────────────────────
    // Same account and same API key as the email side — Brevo is one key, several endpoints.
    @Value("${app.mail.brevo.api-key:}") private String brevoKey;
    /** Alphanumeric sender, max 11 characters. Brevo rejects anything longer. */
    @Value("${app.sms.brevo.sender:GoZone}") private String brevoSender;
    @Value("${app.mail.brevo.base-url:https://api.brevo.com}") private String brevoBaseUrl;

    /**
     * Bounded HTTP client. A bare {@code new RestTemplate()} has NO connect or read timeout, so an
     * unresponsive SMS gateway blocks the calling thread forever — the fail-soft catch below never
     * fires and sign-in hangs instead of falling back to a logged code. These timeouts are what
     * make the fallback actually reachable.
     */
    private final RestTemplate rest = bounded();

    private static RestTemplate bounded() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout((int) Duration.ofSeconds(4).toMillis());
        f.setReadTimeout((int) Duration.ofSeconds(8).toMillis());
        return new RestTemplate(f);
    }

    /**
     * Sends happen off the request thread: signing in must never wait on a third-party SMS
     * gateway. The code is persisted before this runs, so the user can verify as soon as the
     * message arrives — or, while the sender ID is unapproved, as soon as it is logged.
     */
    private final ExecutorService dispatch = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "sms-dispatch");
        t.setDaemon(true);
        return t;
    });

    /** Can we attempt a real send at all? Either provider will do. */
    public boolean enabled() { return notBlank(arkeselKey) || notBlank(apiKey) || brevoConfigured(); }

    private boolean brevoConfigured() { return notBlank(brevoKey); }

    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }

    /** Send the OTP. The code is logged either way — see {@link #logCodes}. */
    public void sendOtp(String phone, String code, int expiryMinutes) {
        String message = "Your GoZone verification code is " + code
            + ". It expires in " + expiryMinutes + " minutes.";

        if (!enabled()) {
            log.info("[OTP-MOCK] phone={} code={} expires_in={}m (no SMS provider configured)", phone, code, expiryMinutes);
            return;
        }

        // Surfaced before any network call, so a slow or failing provider can neither delay the
        // code nor hide it. Same tag as the unconfigured path on purpose: whatever tails the logs
        // during a demo should not need to know which branch produced the code.
        if (logCodes) {
            log.info("[OTP-MOCK] phone={} code={} expires_in={}m (logged: OTP_LOG_CODES=true)", phone, code, expiryMinutes);
        }

        /*
         * Termii first, Brevo second.
         *
         * Termii is the intended provider but its sender ID is pending approval, so its sends are
         * expected to fail for now — which is exactly when a fallback earns its place. Brevo is
         * tried only after Termii actually fails, so once Termii is approved nothing changes and
         * no message is ever sent twice.
         *
         * Either way the code was already logged above, so a total failure of both providers
         * still leaves a working sign-in rather than a locked-out user.
         */
        dispatch.submit(() -> {
            if (notBlank(arkeselKey)) {
                try {
                    sendViaArkesel(phone, message);
                    log.info("[SMS] verification code sent to {} via arkesel", phone);
                    return;
                } catch (Exception e) {
                    log.warn("[SMS] arkesel send to {} failed ({})", phone, e.getMessage());
                }
            }
            if (notBlank(apiKey)) {
                try {
                    sendViaTermii(phone, message);
                    log.info("[SMS] verification code sent to {} via termii", phone);
                    return;
                } catch (Exception e) {
                    log.warn("[SMS] termii send to {} failed ({})", phone, e.getMessage());
                }
            }
            if (brevoConfigured()) {
                try {
                    sendViaBrevo(phone, message);
                    log.info("[SMS] verification code sent to {} via brevo (fallback)", phone);
                    return;
                } catch (Exception e) {
                    log.warn("[SMS] brevo fallback to {} failed ({})", phone, e.getMessage());
                }
            }
            log.warn("[SMS] no provider delivered to {} — the code above still works", phone);
        });
    }

    /**
     * Termii's send API.
     *
     * <p>The API key goes in the JSON body, not a header — their design, not ours. Numbers are
     * sent without a leading "+": Termii expects the international form as digits only, and a "+"
     * is one of the two things that makes a send fail for a number that is otherwise fine.
     */
    private void sendViaTermii(String phone, String message) {
        String url = baseUrl + "/api/sms/send";

        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.setAccept(java.util.List.of(MediaType.APPLICATION_JSON));

        Map<String, String> body = new LinkedHashMap<>();
        body.put("to", phone.startsWith("+") ? phone.substring(1) : phone);
        body.put("from", senderId);
        body.put("sms", message);
        body.put("type", "plain");
        body.put("channel", channel);
        body.put("api_key", apiKey);

        rest.exchange(url, HttpMethod.POST, new HttpEntity<>(body, h), String.class);
    }

    /**
     * Brevo's transactional SMS API.
     *
     * <p>Same key as the email side, different endpoint. The number goes without a leading "+" —
     * Brevo wants the international form as digits only, the same quirk Termii has, and the same
     * one that makes a perfectly valid number fail.
     *
     * <p>⚠️ Brevo SMS is credit-based: an account with zero SMS credits authenticates fine and
     * refuses the send, which surfaces here as a failed fallback rather than a config error.
     */
    private void sendViaBrevo(String phone, String message) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.setAccept(java.util.List.of(MediaType.APPLICATION_JSON));
        h.set("api-key", brevoKey);

        Map<String, String> body = new LinkedHashMap<>();
        body.put("sender", brevoSender);
        body.put("recipient", phone.startsWith("+") ? phone.substring(1) : phone);
        body.put("content", message);
        body.put("type", "transactional");

        rest.exchange(brevoBaseUrl + "/v3/transactionalSMS/sms", HttpMethod.POST,
            new HttpEntity<>(body, h), String.class);
    }

    /**
     * Arkesel's v2 send API.
     *
     * <p>Ghanaian numbers are sent in international form without the leading "+" — the same
     * convention the other two providers use, and the same thing that quietly breaks a send for
     * an otherwise perfectly valid number.
     *
     * <p>⚠️ Arkesel answers HTTP 200 for some *application-level* failures (an unapproved sender
     * ID, an empty balance), with the reason in the JSON body rather than the status code. The
     * response is logged at debug so a "successful" send that never arrived can be explained
     * without spending another credit to reproduce it.
     */
    private void sendViaArkesel(String phone, String message) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.setAccept(java.util.List.of(MediaType.APPLICATION_JSON));
        h.set("api-key", arkeselKey);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sender", arkeselSender);
        body.put("message", message);
        body.put("recipients", java.util.List.of(phone.startsWith("+") ? phone.substring(1) : phone));

        String res = rest.exchange(arkeselBaseUrl + "/api/v2/sms/send", HttpMethod.POST,
            new HttpEntity<>(body, h), String.class).getBody();
        log.debug("[SMS] arkesel response: {}", res);
    }
}
