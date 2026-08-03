package com.gozone.auth.repository;

import com.gozone.auth.model.Upload;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface UploadRepository extends JpaRepository<Upload, UUID> {
}
