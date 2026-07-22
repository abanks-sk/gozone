package com.gozone.food.controller;

import com.gozone.food.dto.CreatePromoRequest;
import com.gozone.food.dto.PromoResponse;
import com.gozone.food.service.PromoService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Promo cards. Context-path is /food, so these are /food/promos. */
@RestController
public class PromoController {

    private final PromoService promoService;

    public PromoController(PromoService promoService) {
        this.promoService = promoService;
    }

    /** Customer-facing: active promos for the shop carousel. */
    @GetMapping("/promos")
    public ResponseEntity<List<PromoResponse>> active() {
        return ResponseEntity.ok(promoService.listActive());
    }

    /** Admin: all promos (incl. inactive) for management. */
    @GetMapping("/promos/all")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<List<PromoResponse>> all() {
        return ResponseEntity.ok(promoService.listAll());
    }

    @PostMapping("/promos")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<PromoResponse> create(@Valid @RequestBody CreatePromoRequest req) {
        return ResponseEntity.ok(promoService.create(req));
    }

    /** Vendor self-serve: apply to promote their business (admin activates = approves). */
    @PostMapping("/promos/apply")
    @PreAuthorize("hasRole('RESTAURANT_OWNER')")
    public ResponseEntity<PromoResponse> apply(
            @org.springframework.security.core.annotation.AuthenticationPrincipal String ownerId,
            @RequestBody Map<String, String> body) {
        UUID vendorId = UUID.fromString(body.get("vendorId"));
        String title = body.getOrDefault("title", "");
        if (title.isBlank()) throw new IllegalStateException("Give your promotion a title");
        return ResponseEntity.ok(promoService.apply(ownerId, vendorId, title, body.get("subtitle")));
    }

    /** Vendor: their promo applications for one of their businesses. */
    @GetMapping("/promos/mine")
    @PreAuthorize("hasRole('RESTAURANT_OWNER')")
    public ResponseEntity<List<PromoResponse>> mine(
            @org.springframework.security.core.annotation.AuthenticationPrincipal String ownerId,
            @RequestParam UUID vendorId) {
        return ResponseEntity.ok(promoService.mine(ownerId, vendorId));
    }

    @PatchMapping("/promos/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<PromoResponse> setActive(@PathVariable UUID id, @RequestBody Map<String, Boolean> body) {
        return ResponseEntity.ok(promoService.setActive(id, Boolean.TRUE.equals(body.get("active"))));
    }

    @DeleteMapping("/promos/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        promoService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
