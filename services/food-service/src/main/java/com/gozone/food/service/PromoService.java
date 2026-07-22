package com.gozone.food.service;

import com.gozone.food.dto.CreatePromoRequest;
import com.gozone.food.dto.PromoResponse;
import com.gozone.food.model.MenuItem;
import com.gozone.food.model.Promo;
import com.gozone.food.model.Vendor;
import com.gozone.food.repository.MenuItemRepository;
import com.gozone.food.repository.PromoRepository;
import com.gozone.food.repository.VendorRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class PromoService {

    private final PromoRepository repo;
    private final VendorRepository vendorRepo;
    private final MenuItemRepository menuItemRepo;

    public PromoService(PromoRepository repo, VendorRepository vendorRepo, MenuItemRepository menuItemRepo) {
        this.repo = repo;
        this.vendorRepo = vendorRepo;
        this.menuItemRepo = menuItemRepo;
    }

    @Transactional(readOnly = true)
    public List<PromoResponse> listActive() {
        return repo.findByActiveTrueOrderByCreatedAtDesc().stream().map(PromoResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<PromoResponse> listAll() {
        return repo.findAllByOrderByCreatedAtDesc().stream().map(PromoResponse::from).toList();
    }

    /** Admin creates a promo directly — live as soon as it is saved. */
    public PromoResponse create(CreatePromoRequest req) {
        Promo p = new Promo();
        applyFields(p, req);
        p.setActive(true);
        repo.save(p);
        return PromoResponse.from(p);
    }

    /**
     * Vendor self-serve: apply to promote one of their own businesses. The promo
     * is created INACTIVE — an admin activating it on the Promos page is the
     * approval, so the vendor cannot put their own discount live.
     */
    public PromoResponse apply(String ownerId, CreatePromoRequest req) {
        if (req.getVendorId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose which business to promote");
        }
        requireOwner(ownerId, req.getVendorId());
        Promo p = new Promo();
        applyFields(p, req);
        if (p.getSubtitle() == null || p.getSubtitle().isBlank()) {
            p.setSubtitle(vendorRepo.findById(req.getVendorId()).map(Vendor::getName).orElse(null));
        }
        p.setActive(false); // pending admin approval
        repo.save(p);
        return PromoResponse.from(p);
    }

    /** Vendor: their own promo applications (any status) for the given business. */
    @Transactional(readOnly = true)
    public List<PromoResponse> mine(String ownerId, UUID vendorId) {
        requireOwner(ownerId, vendorId);
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

    // ── helpers ──────────────────────────────────────────────────────────────

    /**
     * Copy request fields onto the promo, validating the combination. The rules:
     * a DISCOUNT must carry usable terms, a CATEGORY promo must name a category,
     * an ITEM promo must point at an item that belongs to the promoted vendor.
     */
    private void applyFields(Promo p, CreatePromoRequest req) {
        p.setTitle(req.getTitle().trim());
        p.setSubtitle(req.getSubtitle());
        p.setDescription(req.getDescription());
        if (req.getColor() != null && !req.getColor().isBlank()) p.setColor(req.getColor().trim());
        p.setImageUrl(req.getImageUrl() != null && !req.getImageUrl().isBlank() ? req.getImageUrl().trim() : null);
        p.setVendorId(req.getVendorId());

        Promo.Kind kind = parse(Promo.Kind.class, req.getPromoKind(), Promo.Kind.DISCOUNT);
        Promo.Scope scope = parse(Promo.Scope.class, req.getScope(), Promo.Scope.VENDOR);
        p.setPromoKind(kind);
        p.setScope(scope);

        // Scope targets
        p.setCategory(null);
        p.setMenuItemId(null);
        switch (scope) {
            case CATEGORY -> {
                if (req.getCategory() == null || req.getCategory().isBlank()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a category for this promotion");
                }
                p.setCategory(req.getCategory().trim());
            }
            case ITEM -> {
                if (req.getMenuItemId() == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose an item for this promotion");
                }
                MenuItem item = menuItemRepo.findById(req.getMenuItemId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Item not found"));
                if (p.getVendorId() != null && !item.getRestaurant().getId().equals(p.getVendorId())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That item belongs to another business");
                }
                p.setMenuItemId(item.getId());
                if (p.getVendorId() == null) p.setVendorId(item.getRestaurant().getId());
            }
            case VENDOR -> {
                // A vendor-wide promo needs a vendor; without one it is a generic
                // announcement card, which is still allowed (legacy behaviour).
                if (req.getCategory() != null && !req.getCategory().isBlank()) p.setCategory(req.getCategory().trim());
            }
        }

        // Discount terms
        if (kind == Promo.Kind.DISCOUNT) {
            if (p.getVendorId() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A discount must belong to a business — choose one");
            }
            Promo.DiscountType dt = parse(Promo.DiscountType.class, req.getDiscountType(), null);
            if (dt == null || req.getDiscountValue() == null || req.getDiscountValue().signum() <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A discount needs a type (percent or amount) and a value above zero");
            }
            if (dt == Promo.DiscountType.PERCENT && req.getDiscountValue().compareTo(BigDecimal.valueOf(90)) > 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A percentage discount cannot exceed 90%");
            }
            p.setDiscountType(dt);
            p.setDiscountValue(req.getDiscountValue());
        } else {
            // Vendor-fulfilled: the platform stores no money terms.
            p.setDiscountType(null);
            p.setDiscountValue(null);
        }
    }

    private Vendor requireOwner(String ownerId, UUID vendorId) {
        Vendor vendor = vendorRepo.findById(vendorId)
            .orElseThrow(() -> new IllegalStateException("Business not found"));
        if (!vendor.getOwnerId().equals(UUID.fromString(ownerId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your business");
        }
        return vendor;
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String raw, E fallback) {
        if (raw == null || raw.isBlank()) return fallback;
        try { return Enum.valueOf(type, raw.trim().toUpperCase()); }
        catch (IllegalArgumentException e) { return fallback; }
    }
}
