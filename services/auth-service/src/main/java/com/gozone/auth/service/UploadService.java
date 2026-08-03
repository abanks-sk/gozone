package com.gozone.auth.service;

import com.gozone.auth.model.Upload;
import com.gozone.auth.repository.UploadRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.UUID;

/**
 * Stores KYC documents in a folder on a mounted volume, and hands them back only to people
 * entitled to see them.
 *
 * ## Why a folder
 *
 * Chosen over object storage deliberately: it needs no third-party account or credentials, which
 * matters for a project where every other integration already has to fail soft. The trade-off is
 * that the folder must be a **Docker volume** — written into the container's own filesystem, every
 * driver's documents would vanish the next time the image is rebuilt, and this service is rebuilt
 * constantly.
 *
 * ## What is guarded, and why
 *
 * These are identity documents — somebody's face, licence and vehicle. Three separate things
 * could leak them, so all three are closed:
 *
 * 1. **The filename.** Never taken from the client. An uploaded filename is attacker-controlled
 *    and `../../application.yml` is the first thing anyone tries; the stored name is a fresh UUID
 *    and the extension comes from the type we detected, not the one we were told.
 * 2. **The content.** The declared `Content-Type` is just a header. The bytes are sniffed and
 *    anything that is not actually a JPEG, PNG or WebP is refused — otherwise "profile.jpg" can
 *    be a script that some future static handler happily serves back.
 * 3. **The reader.** Downloads are checked against the recorded owner, so a URL alone is not
 *    enough. Guessing a v4 UUID is not the risk; a URL landing in a log, a screenshot or a
 *    forwarded message is.
 */
@Service
public class UploadService {

    private static final Logger log = LoggerFactory.getLogger(UploadService.class);

    /** What we accept, mapped to the extension we store it under. */
    private static final Map<String, String> ALLOWED = Map.of(
        "image/jpeg", ".jpg",
        "image/png", ".png",
        "image/webp", ".webp"
    );

    private final UploadRepository uploadRepo;
    private final Path root;
    private final long maxBytes;

    public UploadService(UploadRepository uploadRepo,
                         @Value("${app.uploads.dir:/var/gozone/uploads}") String dir,
                         @Value("${app.uploads.max-bytes:6291456}") long maxBytes) {
        this.uploadRepo = uploadRepo;
        this.root = Paths.get(dir).toAbsolutePath().normalize();
        this.maxBytes = maxBytes;
        try {
            Files.createDirectories(root);
            log.info("[UPLOAD] storing documents in {} (max {} bytes)", root, maxBytes);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot create upload directory " + root, e);
        }
    }

    /** Save one image for this owner and return its id. */
    @Transactional
    public Upload store(UUID ownerId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file was sent.");
        }
        if (file.getSize() > maxBytes) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                "That image is too large. Keep it under " + (maxBytes / (1024 * 1024)) + " MB.");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read the upload.");
        }

        // Sniffed, not trusted. `file.getContentType()` is whatever the client chose to claim.
        String type = sniff(bytes);
        if (type == null) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "Only JPEG, PNG or WebP images are accepted.");
        }

        UUID id = UUID.randomUUID();
        String storedName = id + ALLOWED.get(type);
        Path target = root.resolve(storedName).normalize();
        // Belt and braces: storedName is ours, but a resolve that escapes the root is never right.
        if (!target.startsWith(root)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bad filename.");
        }
        try {
            Files.write(target, bytes);
        } catch (IOException e) {
            log.error("[UPLOAD] could not write {}: {}", target, e.toString());
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not save the image.");
        }

        Upload u = new Upload();
        u.setId(id);
        u.setOwnerId(ownerId);
        u.setStoredName(storedName);
        u.setContentType(type);
        u.setSizeBytes(bytes.length);
        uploadRepo.save(u);
        log.info("[UPLOAD] {} stored {} ({} bytes) for {}", id, type, bytes.length, ownerId);
        return u;
    }

    /**
     * Fetch an upload, refusing anyone who is neither its owner nor an admin.
     *
     * 404 rather than 403 when the caller is not entitled: a 403 would confirm the document
     * exists, which is itself something a stranger should not learn about someone's ID.
     */
    public record Stored(Upload meta, byte[] bytes) {}

    @Transactional(readOnly = true)
    public Stored read(UUID id, UUID requesterId, boolean isAdmin) {
        Upload u = uploadRepo.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found."));
        if (!isAdmin && !u.getOwnerId().equals(requesterId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found.");
        }
        Path p = root.resolve(u.getStoredName()).normalize();
        if (!p.startsWith(root) || !Files.exists(p)) {
            // The row outlived the file — most likely the volume was not mounted at some point.
            log.warn("[UPLOAD] {} recorded but missing at {}", id, p);
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found.");
        }
        try {
            return new Stored(u, Files.readAllBytes(p));
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not read the image.");
        }
    }

    /** Magic-byte detection for the three formats we accept; null means "not one of them". */
    private static String sniff(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
            && (b[4] & 0xFF) == 0x0D && (b[5] & 0xFF) == 0x0A && (b[6] & 0xFF) == 0x1A && (b[7] & 0xFF) == 0x0A) {
            return "image/png";
        }
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
            && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
            return "image/webp";
        }
        return null;
    }
}
