package com.gozone.food.repository;

import com.gozone.food.model.PlatformSettings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlatformSettingsRepository extends JpaRepository<PlatformSettings, Short> {
}
