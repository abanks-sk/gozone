package com.gozone.auth.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;

/**
 * Verifies a Google ID token server-side (never trust the client's word for identity).
 *
 * Uses Google's tokeninfo endpoint, then checks:
 *   - the token was issued for OUR OAuth client (aud), and
 *   - the email is verified by Google.
 */
@Service
public class GoogleTokenVerifier {

    private static final Logger log = LoggerFactory.getLogger(GoogleTokenVerifier.class);

    /** Comma-separated OAuth client IDs (web / android / ios). Blank = audience check skipped. */
    @Value("${app.google.client-ids:}")
    private String clientIds;

    private final RestTemplate rest = new RestTemplate();

    /** Verified Google identity. */
    public record GoogleUser(String email, String name) {}

    public GoogleUser verify(String idToken) {
        if (idToken == null || idToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing Google token.");
        }
        JsonNode info;
        try {
            info = rest.getForObject("https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken, JsonNode.class);
        } catch (Exception e) {
            log.warn("[GOOGLE] tokeninfo call failed: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Could not verify your Google sign-in.");
        }
        if (info == null || info.path("email").asText("").isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid Google token.");
        }

        // The token must have been minted for one of our own OAuth clients.
        if (clientIds != null && !clientIds.isBlank()) {
            String aud = info.path("aud").asText("");
            boolean ours = Arrays.stream(clientIds.split(","))
                .map(String::trim).filter(s -> !s.isEmpty())
                .anyMatch(aud::equals);
            if (!ours) {
                log.warn("[GOOGLE] token audience {} is not one of our client IDs", aud);
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "This Google token wasn't issued for GoZone.");
            }
        }
        if (!"true".equalsIgnoreCase(info.path("email_verified").asText(""))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Your Google email isn't verified.");
        }

        return new GoogleUser(
            info.path("email").asText("").trim().toLowerCase(),
            info.path("name").asText(""));
    }
}
