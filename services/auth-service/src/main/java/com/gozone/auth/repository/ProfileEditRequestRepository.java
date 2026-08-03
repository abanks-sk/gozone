package com.gozone.auth.repository;

import com.gozone.auth.model.ProfileEditRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProfileEditRequestRepository extends JpaRepository<ProfileEditRequest, UUID> {

    /** The driver's own history, newest first — the app shows the latest one's state. */
    List<ProfileEditRequest> findByUserIdOrderByCreatedAtDesc(UUID userId);

    /** The one still waiting, if any. A driver may only have one open at a time. */
    Optional<ProfileEditRequest> findByUserIdAndStatus(UUID userId, ProfileEditRequest.Status status);

    /** The admin review queue. */
    List<ProfileEditRequest> findByStatusOrderByCreatedAtAsc(ProfileEditRequest.Status status);
    List<ProfileEditRequest> findAllByOrderByCreatedAtDesc();
}
