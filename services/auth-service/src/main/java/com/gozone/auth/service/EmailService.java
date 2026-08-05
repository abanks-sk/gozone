package com.gozone.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sends verification codes by email, through Brevo's HTTP API.
 *
 * <p>This used to be Gmail SMTP via {@code JavaMailSender}. SMTP was replaced rather than kept as
 * a fallback because of where this runs: Railway — like most PaaS providers — blocks or filters
 * outbound SMTP on 25/465/587. The old setup worked perfectly on a laptop and would have silently
 * stopped delivering the moment it was deployed, which is the worst kind of failure: correct
 * configuration, no error, no email. An ordinary HTTPS call has none of that problem.
 *
 * <p>Fails soft, exactly as before: if Brevo is unconfigured or the call fails, the code is logged
 * so sign-in still works. See {@link #logCodes} for why that is deliberate right now.
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    @Value("${app.mail.brevo.api-key:}")   private String apiKey;
    /**
     * The From address. Brevo will only send from a domain or address you have verified with
     * them — an unverified sender is the most common reason a correct-looking call is rejected.
     */
    @Value("${app.mail.brevo.sender:}")    private String senderEmail;
    @Value("${app.mail.from-name:GoZone}") private String fromName;
    @Value("${app.mail.brevo.base-url:https://api.brevo.com}") private String baseUrl;

    /** See SmsService.logCodes — same reasoning, same warning: logs become credentials. */
    @Value("${app.otp.log-codes:true}") private boolean logCodes;

    /** Bounded, so an unresponsive provider cannot hold a sign-in thread open indefinitely. */
    private final RestTemplate rest = bounded();

    private static RestTemplate bounded() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout((int) Duration.ofSeconds(4).toMillis());
        f.setReadTimeout((int) Duration.ofSeconds(8).toMillis());
        return new RestTemplate(f);
    }

    /** Sending happens off the request thread — signing in must not wait on an email provider. */
    private final ExecutorService dispatch = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "email-dispatch");
        t.setDaemon(true);
        return t;
    });

    public boolean enabled() { return notBlank(apiKey) && notBlank(senderEmail); }

    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }

    public void sendVerificationCode(String to, String code, int expiryMinutes) {
        String body = """
            Your GoZone verification code is: %s

            It expires in %d minutes.

            If you didn't request this, you can safely ignore this email.
            """.formatted(code, expiryMinutes);

        if (!enabled()) {
            log.info("[EMAIL-MOCK] to={} code={} expires_in={}m (Brevo not configured)", to, code, expiryMinutes);
            return;
        }

        // Before the network call, so a slow or failing provider can neither delay the code nor
        // hide it. Same tag as the unconfigured path: whoever is tailing the logs during a demo
        // should not have to know which branch produced the code.
        if (logCodes) {
            log.info("[EMAIL-MOCK] to={} code={} expires_in={}m (logged: OTP_LOG_CODES=true)", to, code, expiryMinutes);
        }

        dispatch.submit(() -> {
            try {
                send(to, "Your GoZone verification code", body);
                log.info("[EMAIL] verification code sent to {} via brevo", to);
            } catch (Exception e) {
                log.warn("[EMAIL] brevo send to {} failed ({}) — the code above still works", to, e.getMessage());
            }
        });
    }

    private void send(String to, String subject, String text) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.setAccept(List.of(MediaType.APPLICATION_JSON));
        // Brevo authenticates with its own header, not Authorization.
        h.set("api-key", apiKey);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sender", Map.of("name", fromName, "email", senderEmail));
        payload.put("to", List.of(Map.of("email", to)));
        payload.put("subject", subject);
        payload.put("textContent", text);

        rest.exchange(baseUrl + "/v3/smtp/email", HttpMethod.POST,
            new HttpEntity<>(payload, h), String.class);
    }
}
