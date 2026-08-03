package com.gozone.auth.controller;

import com.gozone.auth.model.Upload;
import com.gozone.auth.service.UploadService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;
import java.util.UUID;

/**
 * Upload and retrieval of KYC documents.
 *
 * Both endpoints require a signed-in user (everything not explicitly permitted in SecurityConfig
 * does). Retrieval additionally checks ownership in {@link UploadService#read} — these are
 * identity documents, so holding the URL must not be the same as being allowed to see it.
 */
@RestController
public class UploadController {

    private final UploadService uploads;

    public UploadController(UploadService uploads) {
        this.uploads = uploads;
    }

    /**
     * Store one image and return its id plus the path to fetch it back from.
     *
     * The returned `url` is relative on purpose: the app already knows the gateway's address and
     * it changes with the network (laptop IP, tunnel, deployed host). Baking an absolute URL into
     * the database would pin every driver's documents to whatever address the server happened to
     * have on the day they signed up.
     */
    @PostMapping(value = "/uploads", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, String>> upload(
            @AuthenticationPrincipal String userId,
            @RequestPart("file") MultipartFile file) {
        Upload u = uploads.store(UUID.fromString(userId), file);
        return ResponseEntity.ok(Map.of(
            "id", u.getId().toString(),
            "url", "/auth/uploads/" + u.getId()
        ));
    }

    /** Serve an upload to its owner, or to an admin reviewing it. */
    @GetMapping("/uploads/{id}")
    public ResponseEntity<byte[]> get(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId,
            Authentication auth) {
        boolean isAdmin = auth != null && auth.getAuthorities().stream()
            .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN") || a.getAuthority().equals("ROLE_SUPER_ADMIN"));
        UploadService.Stored s = uploads.read(id, UUID.fromString(userId), isAdmin);
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(s.meta().getContentType()))
            // Private: an identity document must not be cached by anything shared. Immutable
            // because the id names these exact bytes — they are never rewritten in place.
            .cacheControl(CacheControl.maxAge(java.time.Duration.ofHours(1)).cachePrivate().immutable())
            .body(s.bytes());
    }
}
