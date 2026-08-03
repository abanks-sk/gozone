package com.gozone.auth.model;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A file a user has uploaded — today only KYC documents.
 *
 * The row exists mainly to answer "who may read this?". The bytes live in a folder on a mounted
 * volume; without an owner recorded against them, serving them would mean anyone with the URL
 * could read a stranger's licence or photograph. See {@code V6__kyc_uploads.sql}.
 */
@Entity
@Table(name = "uploads")
public class Upload {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    /**
     * Who is allowed to read it.
     *
     * PRIVATE is the default and covers every KYC document: owner or admin only. PUBLIC is for
     * vendor storefront and menu imagery, which a customer browsing the shop has to be able to
     * see — and on the web an {@code <Image>} cannot send an Authorization header, so requiring a
     * signed-in reader would not work there either.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Visibility visibility = Visibility.PRIVATE;

    public enum Visibility { PRIVATE, PUBLIC }

    /**
     * Filename on disk. Always generated here, never derived from what the client sent — an
     * uploaded filename is attacker-controlled and path traversal is the obvious thing to try.
     */
    @Column(name = "stored_name", nullable = false, columnDefinition = "text")
    private String storedName;

    @Column(name = "content_type", nullable = false, columnDefinition = "text")
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getOwnerId() { return ownerId; }
    public void setOwnerId(UUID ownerId) { this.ownerId = ownerId; }
    public String getStoredName() { return storedName; }
    public void setStoredName(String storedName) { this.storedName = storedName; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public long getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(long sizeBytes) { this.sizeBytes = sizeBytes; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }

    public Visibility getVisibility() { return visibility; }
    public void setVisibility(Visibility visibility) { this.visibility = visibility; }
}
