package com.gozone.food.service;

import com.gozone.food.dto.CreatePromoRequest;
import com.gozone.food.dto.PromoResponse;
import com.gozone.food.model.Promo;
import com.gozone.food.model.Vendor;
import com.gozone.food.repository.PromoRepository;
import com.gozone.food.repository.VendorRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class PromoService {

    private final PromoRepository repo;
    private final VendorRepository vendorRepo;

    public PromoService(PromoRepository repo, VendorRepository vendorRepo) {
        this.repo = repo;
        this.vendorRepo = vendorRepo;
    }

    @Transactional(readOnly = true)
    public List<PromoResponse> listActive() {
        return repo.findByActiveTrueOrderByCreatedAtDesc().stream().map(PromoResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<PromoResponse> listAll() {
        return repo.findAllByOrderByCreatedAtDesc().stream().map(PromoResponse::from).toList();
    }

    public PromoResponse create(CreatePromoRequest req) {
        Promo p = new Promo();
        p.setTitle(req.getTitle().trim());
        p.setSubtitle(req.getSubtitle());
        if (req.getColor() != null && !req.getColor().isBlank()) p.setColor(req.getColor());
        p.setVendorId(req.getVendorId());
        p.setCategory(req.getCategory());
        repo.save(p);
        return PromoResponse.from(p);
    }

    /**
     * Vendor self-serve: apply to promote one of their own businesses. The promo
     * is created INACTIVE — an admin activates it on the Promos page (= approval).
     */
    public PromoResponse apply(String ownerId, UUID vendorId, String title, String subtitle) {
        Vendor vendor = vendorRepo.findById(vendorId)
            .orElseThrow(() -> new IllegalStateException("Business not found"));
        if (!vendor.getOwnerId().equals(UUID.fromString(ownerId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your business");
        }
        Promo p = new Promo();
        p.setTitle(title.trim());
        p.setSubtitle(subtitle == null || subtitle.isBlank() ? vendor.getName() : subtitle.trim());
        p.setVendorId(vendorId);
        p.setActive(false); // pending admin approval
        repo.save(p);
        return PromoResponse.from(p);
    }

    /** Vendor: their own promo applications (any status) for the given business. */
    @Transactional(readOnly = true)
    public List<PromoResponse> mine(String ownerId, UUID vendorId) {
        Vendor vendor = vendorRepo.findById(vendorId)
            .orElseThrow(() -> new IllegalStateException("Business not found"));
        if (!vendor.getOwnerId().equals(UUID.fromString(ownerId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your business");
        }
        return repo.findAllByOrderByCreatedAtDesc().stream()
            .filter(p -> vendorId.equals(p.getVendorId()))
            .map(PromoResponse::from).toList();
    }

    public PromoResponse setActive(UUID id, boolean active) {
        Promo p = repo.findById(id).orElseThrow(() -> new IllegalStateException("Promo not found"));
        p.setActive(active);
        repo.save(p);
        return PromoResponse.from(p);
    }

    public void delete(UUID id) {
        repo.deleteById(id);
    }
}
