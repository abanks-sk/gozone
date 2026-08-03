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
            @RequestParam(required = false) String visibility,
            Authentication auth,
            @RequestPart("file") MultipartFile file) {
        // A public upload is shop imagery, and only somebody who runs a shop has a reason to make
        // one. Letting any signed-in user create publicly-readable files would turn this into an
        // open image host attached to the platform's domain.
        Upload.Visibility vis = "public".equalsIgnoreCase(visibility)
            ? Upload.Visibility.PUBLIC : Upload.Visibility.PRIVATE;
        if (vis == Upload.Visibility.PUBLIC && !hasAnyRole(auth, "ROLE_RESTAURANT_OWNER", "ROLE_ADMIN", "ROLE_SUPER_ADMIN")) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "Only vendors can publish images.");
        }
        Upload u = uploads.store(UUID.fromString(userId), file, vis);
        return ResponseEntity.ok(Map.of(
            "id", u.getId().toString(),
            "url", "/auth/uploads/" + u.getId()
        ));
    }

    /**
     * Serve an upload.
     *
     * Public ones (vendor storefront and menu imagery) go to anyone: a customer browsing the shop
     * has to see them, and on the web an {@code <Image>} cannot attach an Authorization header, so
     * even "must be signed in" would not work. Everything else is an identity document — the owner
     * or a reviewing admin, and a missing token is a 401 rather than a peek.
     */
    @GetMapping("/uploads/{id}")
    public ResponseEntity<byte[]> get(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId,
            Authentication auth) {
        boolean isAdmin = hasAnyRole(auth, "ROLE_ADMIN", "ROLE_SUPER_ADMIN");
        boolean isPublic = uploads.isPublic(id);
        UUID caller = callerId(userId);
        if (!isPublic && caller == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.UNAUTHORIZED, "Sign in to view this.");
        }
        UploadService.Stored s = uploads.read(id, caller, isAdmin);
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(s.meta().getContentType()))
            // Immutable either way — the id names these exact bytes and they are never rewritten in
            // place. Private additionally must not be held by anything shared.
            .cacheControl(isPublic
                ? CacheControl.maxAge(java.time.Duration.ofDays(7)).cachePublic().immutable()
                : CacheControl.maxAge(java.time.Duration.ofHours(1)).cachePrivate().immutable())
            .body(s.bytes());
    }

    /**
     * The signed-in user, or null when nobody is.
     *
     * Spring hands `@AuthenticationPrincipal` the string <b>"anonymousUser"</b> rather than null on
     * an unauthenticated request, so a plain null check silently passes and `UUID.fromString` then
     * throws — which surfaced as a 500 on exactly the requests that are supposed to be allowed
     * through without a token.
     */
    private static UUID callerId(String principal) {
        if (principal == null || principal.isBlank() || "anonymousUser".equals(principal)) return null;
        try {
            return UUID.fromString(principal);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static boolean hasAnyRole(Authentication auth, String... roles) {
        if (auth == null) return false;
        for (String r : roles) {
            if (auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals(r))) return true;
        }
        return false;
    }
}
