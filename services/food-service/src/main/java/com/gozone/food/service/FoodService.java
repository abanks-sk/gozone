package com.gozone.food.service;

import com.gozone.food.dto.*;
import com.gozone.food.model.*;
import com.gozone.food.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
public class FoodService {

    private static final Logger log = LoggerFactory.getLogger(FoodService.class);

    private final VendorRepository vendorRepo;
    private final MenuItemRepository menuItemRepo;
    private final OrderRepository orderRepo;
    private final DeliveryRepository deliveryRepo;
    private final QueueEntryRepository queueRepo;
    private final FoodRatingRepository ratingRepo;
    private final PlatformSettingsRepository settingsRepo;
    private final PromoRepository promoRepo;
    private final SimpMessagingTemplate messaging;
    private final WalletClient walletClient;
    private final NotifyClient notifyClient;
    private final AuthClient authClient;

    @Value("${app.delivery.base-fee:2.00}")
    private BigDecimal deliveryBaseFee;

    @Value("${app.delivery.fee-per-km:1.50}")
    private BigDecimal deliveryFeePerKm;

    public FoodService(VendorRepository vendorRepo,
                       MenuItemRepository menuItemRepo,
                       OrderRepository orderRepo,
                       DeliveryRepository deliveryRepo,
                       QueueEntryRepository queueRepo,
                       FoodRatingRepository ratingRepo,
                       PlatformSettingsRepository settingsRepo,
                       PromoRepository promoRepo,
                       SimpMessagingTemplate messaging,
                       WalletClient walletClient,
                       NotifyClient notifyClient,
                       AuthClient authClient) {
        this.vendorRepo = vendorRepo;
        this.menuItemRepo   = menuItemRepo;
        this.orderRepo      = orderRepo;
        this.deliveryRepo   = deliveryRepo;
        this.queueRepo      = queueRepo;
        this.ratingRepo     = ratingRepo;
        this.settingsRepo   = settingsRepo;
        this.promoRepo      = promoRepo;
        this.messaging      = messaging;
        this.walletClient   = walletClient;
        this.notifyClient   = notifyClient;
        this.authClient     = authClient;
    }

    // ── Restaurants ───────────────────────────────────────────────────────────

    /**
     * What a customer browses: trading and approved.
     *
     * Approval used to be implicit — a business existed, therefore customers could order from it,
     * and the only thing anyone had reviewed was the owner's account. A second shop added by an
     * already-approved vendor would have gone live without anybody looking at it.
     */
    @Transactional(readOnly = true)
    public List<VendorResponse> listOpenRestaurants() {
        return listOpenRestaurants(null, null, null);
    }

    /**
     * What a customer browses, near enough to be worth browsing.
     *
     * <p>Without a location this returns everything, which is what it always did — and why a
     * customer in Kumasi was shown a list of Accra restaurants they could not order from. Given
     * coordinates it keeps only what is within {@code radiusKm} and sorts nearest first, so the
     * top of the list is the shop down the road rather than the one that happens to sort first
     * alphabetically.
     *
     * <p>Haversine in Java rather than PostGIS: {@code food_db} has no PostGIS extension (only
     * {@code ride_db} does), the vendor count is small, and adding the extension to satisfy one
     * filter is a migration with far more blast radius than a distance calculation.
     */
    @Transactional(readOnly = true)
    public List<VendorResponse> listOpenRestaurants(Double lat, Double lng, Double radiusKm) {
        List<Vendor> open = vendorRepo.findByStatusAndApprovalStatusOrderByNameAsc(
            Vendor.Status.OPEN, Vendor.Approval.APPROVED);
        if (lat == null || lng == null) {
            return open.stream().map(VendorResponse::from).toList();
        }
        double limit = radiusKm != null && radiusKm > 0 ? radiusKm : defaultBrowseRadiusKm;
        record Near(Vendor v, double km) {}
        return open.stream()
            .map(v -> new Near(v, v.getLat() == null || v.getLng() == null
                ? Double.MAX_VALUE
                : haversineKm(lat, lng, v.getLat().doubleValue(), v.getLng().doubleValue())))
            .filter(n -> n.km() <= limit)
            .sorted(java.util.Comparator.comparingDouble(Near::km))
            .map(n -> VendorResponse.from(n.v(), n.km()))
            .toList();
    }

    /** How far a customer will plausibly travel for a shop — city-scale, not country-scale. */
    @Value("${app.shop.browse-radius-km:25}")
    private double defaultBrowseRadiusKm;

    // Distance comes from the existing haversineKm below — the one the delivery fee already uses.

    // ── Admin: reviewing businesses ────────────────────────────────────────────

    /** The review queue, or everything when no filter is given. */
    @Transactional(readOnly = true)
    public List<VendorResponse> listVendorsForAdmin(String approval) {
        List<Vendor> rows = (approval == null || approval.isBlank())
            ? vendorRepo.findAllByOrderByCreatedAtDesc()
            : vendorRepo.findByApprovalStatusOrderByCreatedAtDesc(Vendor.Approval.valueOf(approval.toUpperCase()));
        return rows.stream().map(VendorResponse::from).toList();
    }

    /**
     * An admin clears a business to trade, or refuses it.
     *
     * A refusal must say why: the owner is shown it, and without one their app can only tell them
     * no. Approving clears any earlier refusal so a working vendor is not still being told why they
     * were once turned down.
     */
    public VendorResponse reviewVendor(UUID vendorId, String adminUserId, String status, String note) {
        Vendor v = vendorRepo.findById(vendorId)
            .orElseThrow(() -> new IllegalStateException("Business not found"));
        Vendor.Approval next = Vendor.Approval.valueOf(status.toUpperCase());
        if (next == Vendor.Approval.REJECTED && (note == null || note.isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Give a reason for the rejection — the owner is shown it.");
        }
        v.setApprovalStatus(next);
        v.setApprovalNote(next == Vendor.Approval.APPROVED ? null
            : (note == null ? null : note.trim().substring(0, Math.min(note.trim().length(), 500))));
        v.setApprovedBy(adminUserId == null ? null : UUID.fromString(adminUserId));
        v.setApprovedAt(OffsetDateTime.now());
        vendorRepo.save(v);
        log.info("[VENDOR] {} approval -> {} by {}", vendorId, next, adminUserId);
        return VendorResponse.from(v);
    }

    /** Vendor onboarding: create the owner's business record. */
    public VendorResponse createVendor(String ownerId, CreateVendorRequest req) {
        Vendor v = new Vendor();
        v.setOwnerId(UUID.fromString(ownerId));
        v.setName(req.getName().trim());
        v.setVendorType(Vendor.VendorType.valueOf(req.getVendorType().toUpperCase()));
        v.setLat(BigDecimal.valueOf(req.getLat()));
        v.setLng(BigDecimal.valueOf(req.getLng()));
        // Unreviewed until an admin looks at it — including the second and third shop an
        // already-approved owner adds, which is the case that had no check at all before.
        v.setApprovalStatus(Vendor.Approval.PENDING);
        vendorRepo.save(v);
        log.info("[VENDOR] created vendor {} type={} owner={}", v.getId(), v.getVendorType(), ownerId);
        return VendorResponse.from(v);
    }

    /**
     * A vendor edits their own business — including the storefront a customer sees.
     *
     * Guarded by {@code requireOwner}, so an owner can only touch their own businesses; the id
     * comes from the path but the authority comes from the token.
     *
     * Null leaves a field unchanged (see {@link UpdateVendorRequest}). Coordinates are only
     * accepted as a pair — half a location is worse than none, since it would silently move the
     * business onto a different meridian and misroute every courier sent to it.
     */
    public VendorResponse updateVendor(UUID vendorId, String ownerId, UpdateVendorRequest req) {
        Vendor v = requireOwner(ownerId, vendorId);
        if (req.getLogoUrl() != null) v.setLogoUrl(imageOrNull(req.getLogoUrl()));

        if (req.getName() != null) {
            String name = req.getName().trim();
            if (name.isEmpty()) {
                throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "A business needs a name.");
            }
            v.setName(name);
        }
        if (req.getVendorType() != null && !req.getVendorType().isBlank()) {
            try {
                v.setVendorType(Vendor.VendorType.valueOf(req.getVendorType().trim().toUpperCase()));
            } catch (IllegalArgumentException e) {
                throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Unknown business type.");
            }
        }
        if (req.getLat() != null || req.getLng() != null) {
            if (req.getLat() == null || req.getLng() == null) {
                throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "Send both lat and lng, or neither.");
            }
            v.setLat(BigDecimal.valueOf(req.getLat()));
            v.setLng(BigDecimal.valueOf(req.getLng()));
        }
        // Blank is a deliberate clear for these three, unlike name.
        if (req.getAddress() != null)     v.setAddress(blankToNull(req.getAddress()));
        if (req.getDescription() != null) v.setDescription(blankToNull(req.getDescription()));
        // Was blankToNull, i.e. any string the vendor typed. The banner is on a page customers
        // read, so it has to be bytes we hold rather than a link to somebody else's server.
        if (req.getImageUrl() != null)    v.setImageUrl(imageOrNull(req.getImageUrl()));
        if (req.getPrepMinutes() != null && req.getPrepMinutes() > 0) {
            v.setPrepMinutes(req.getPrepMinutes());
        }
        if (req.getStatus() != null && !req.getStatus().isBlank()) {
            try {
                v.setStatus(Vendor.Status.valueOf(req.getStatus().trim().toUpperCase()));
            } catch (IllegalArgumentException e) {
                throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Unknown status.");
            }
        }
        vendorRepo.save(v);
        log.info("[VENDOR] updated vendor {} by owner {}", vendorId, ownerId);
        return VendorResponse.from(v);
    }

    private static String blankToNull(String s) {
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /** The signed-in owner's businesses. */
    @Transactional(readOnly = true)
    public List<VendorResponse> myVendors(String ownerId) {
        return vendorRepo.findByOwnerIdOrderByNameAsc(UUID.fromString(ownerId))
            .stream().map(VendorResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<MenuItemResponse> getMenu(UUID restaurantId) {
        return menuItemRepo.findByRestaurantIdAndAvailableTrue(restaurantId)
            .stream().map(MenuItemResponse::from).toList();
    }

    /** Vendor management view: every item (including sold-out ones). */
    @Transactional(readOnly = true)
    public List<MenuItemResponse> getCatalogue(String ownerId, UUID restaurantId) {
        requireOwner(ownerId, restaurantId);
        return menuItemRepo.findByRestaurantIdOrderByName(restaurantId)
            .stream().map(MenuItemResponse::from).toList();
    }

    /** Vendor creates a catalogue item on their own business. */
    public MenuItemResponse createMenuItem(String ownerId, UUID restaurantId, CreateMenuItemRequest req) {
        Vendor vendor = requireOwner(ownerId, restaurantId);
        MenuItem item = new MenuItem();
        item.setRestaurant(vendor);
        item.setName(req.getName().trim());
        item.setDescription(req.getDescription() != null ? req.getDescription().trim() : null);
        item.setCategory(req.getCategory() != null && !req.getCategory().isBlank() ? req.getCategory().trim() : null);
        item.setPrepMinutes(req.getPrepMinutes() != null && req.getPrepMinutes() > 0 ? req.getPrepMinutes() : null);
        item.setPrice(req.getPrice());
        item.setAvailable(req.getAvailable() == null || req.getAvailable());
        // Add-on groups + options (cascade-persisted with the item).
        if (req.getGroups() != null) {
            int gp = 0;
            for (CreateMenuItemRequest.GroupInput gi : req.getGroups()) {
                if (gi.getName() == null || gi.getName().isBlank() || gi.getOptions() == null || gi.getOptions().isEmpty()) continue;
                AddonGroup g = new AddonGroup();
                g.setMenuItem(item);
                g.setName(gi.getName().trim());
                g.setMulti(gi.isMulti());
                g.setRequired(gi.isRequired());
                g.setPosition(gp++);
                int op = 0;
                for (CreateMenuItemRequest.OptionInput oi : gi.getOptions()) {
                    if (oi.getLabel() == null || oi.getLabel().isBlank()) continue;
                    AddonOption o = new AddonOption();
                    o.setGroup(g);
                    o.setLabel(oi.getLabel().trim());
                    o.setPrice(oi.getPrice() != null ? oi.getPrice() : BigDecimal.ZERO);
                    o.setPosition(op++);
                    g.getOptions().add(o);
                }
                if (!g.getOptions().isEmpty()) item.getGroups().add(g);
            }
        }
        item.setImageUrl(imageOrNull(req.getImageUrl()));
        menuItemRepo.save(item);
        log.info("[MENU] item created {} for vendor {}", item.getId(), restaurantId);
        return MenuItemResponse.from(item);
    }

    /**
     * Vendor edits one of their items.
     *
     * <p><b>Only while the shop is closed</b> — except availability, which is deliberately exempt.
     * Changing a price or a description mid-service means the menu a customer is reading is not the
     * menu they will be charged against. Marking something sold out is the opposite: it is a live
     * signal that only matters while you are open, and blocking it would force a vendor to close
     * the shop to say they have run out of jollof.
     */
    public MenuItemResponse updateMenuItem(String ownerId, UUID itemId, UpdateMenuItemRequest req) {
        MenuItem item = menuItemRepo.findById(itemId)
            .orElseThrow(() -> new IllegalStateException("Menu item not found"));
        Vendor vendor = requireOwner(ownerId, item.getRestaurant().getId());
        boolean onlyAvailability = req.getName() == null && req.getDescription() == null
            && req.getCategory() == null && req.getPrepMinutes() == null
            && req.getPrice() == null && req.getImageUrl() == null;
        if (!onlyAvailability && vendor.getStatus() == Vendor.Status.OPEN) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Close the shop to edit your menu. You can still mark items sold out while open.");
        }
        if (req.getImageUrl() != null) item.setImageUrl(imageOrNull(req.getImageUrl()));
        if (req.getName() != null && !req.getName().isBlank()) item.setName(req.getName().trim());
        if (req.getDescription() != null) item.setDescription(req.getDescription().trim());
        if (req.getCategory() != null) item.setCategory(req.getCategory().isBlank() ? null : req.getCategory().trim());
        if (req.getPrepMinutes() != null) item.setPrepMinutes(req.getPrepMinutes() > 0 ? req.getPrepMinutes() : null);
        if (req.getPrice() != null) item.setPrice(req.getPrice());
        if (req.getAvailable() != null) item.setAvailable(req.getAvailable());
        menuItemRepo.save(item);
        return MenuItemResponse.from(item);
    }

    /** Vendor removes one of their items — an edit, so the shop has to be closed. */
    public void deleteMenuItem(String ownerId, UUID itemId) {
        MenuItem item = menuItemRepo.findById(itemId)
            .orElseThrow(() -> new IllegalStateException("Menu item not found"));
        Vendor vendor = requireOwner(ownerId, item.getRestaurant().getId());
        if (vendor.getStatus() == Vendor.Status.OPEN) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Close the shop to remove items from your menu.");
        }
        menuItemRepo.delete(item);
        log.info("[MENU] item deleted {}", itemId);
    }

    // ── Promotions at checkout ──────────────────────────────────────────────────

    /**
     * Resolve the vendor's active promos against this order.
     *
     * <p>DISCOUNT promos are money the platform takes off. Each is evaluated
     * against the part of the order it is scoped to (whole catalogue, one
     * category, or one item) and the <b>single best one wins</b> — discounts do
     * not stack, which keeps the arithmetic explainable to a customer and stops
     * overlapping campaigns from driving a total to zero.
     *
     * <p>BOGO and OTHER promos are fulfilled by the vendor. They are recorded on
     * the order as notes so the customer sees what they are entitled to and the
     * vendor sees what to honour, but no money is computed for them here.
     */
    private void applyPromos(Order order, Vendor vendor, BigDecimal subtotal) {
        List<Promo> promos = promoRepo.findByVendorIdAndActiveTrue(vendor.getId());
        if (promos.isEmpty()) return;

        Promo best = null;
        BigDecimal bestAmount = BigDecimal.ZERO;
        StringBuilder notes = new StringBuilder();

        for (Promo p : promos) {
            if (!p.isPlatformDiscount()) {
                // Vendor-fulfilled: record the terms for both sides.
                if (eligibleAmount(order, p).signum() > 0) {
                    if (notes.length() > 0) notes.append(" · ");
                    notes.append(p.getTitle());
                    if (p.getDescription() != null && !p.getDescription().isBlank()) {
                        notes.append(" — ").append(p.getDescription().trim());
                    }
                }
                continue;
            }
            BigDecimal eligible = eligibleAmount(order, p);
            if (eligible.signum() <= 0) continue;

            BigDecimal amount = p.getDiscountType() == Promo.DiscountType.PERCENT
                ? eligible.multiply(p.getDiscountValue())
                          .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
                : p.getDiscountValue().min(eligible);   // a fixed amount never exceeds what it applies to

            if (amount.compareTo(bestAmount) > 0) { best = p; bestAmount = amount; }
        }

        // Never discount more than the goods are worth.
        bestAmount = bestAmount.min(subtotal).setScale(2, RoundingMode.HALF_UP);

        if (best != null && bestAmount.signum() > 0) {
            order.setDiscount(bestAmount);
            order.setPromoId(best.getId());
            order.setPromoLabel(describe(best));
            log.info("[PROMO] applied {} ({}) −GH{} to order for vendor {}",
                best.getId(), best.getScope(), bestAmount, vendor.getId());
        }
        if (notes.length() > 0) order.setPromoNotes(notes.toString());
    }

    /**
     * How much of this order the promo applies to: everything, just one
     * category, or just one item. Line totals include add-ons, because that is
     * what the customer is actually charged for the line.
     */
    private BigDecimal eligibleAmount(Order order, Promo p) {
        BigDecimal sum = BigDecimal.ZERO;
        for (OrderItem oi : order.getItems()) {
            MenuItem mi = oi.getMenuItem();
            boolean matches = switch (p.getScope()) {
                case VENDOR   -> true;
                case ITEM     -> mi.getId().equals(p.getMenuItemId());
                case CATEGORY -> mi.getCategory() != null && p.getCategory() != null
                                 && mi.getCategory().equalsIgnoreCase(p.getCategory().trim());
            };
            if (matches) sum = sum.add(oi.getUnitPrice().multiply(BigDecimal.valueOf(oi.getQty())));
        }
        return sum;
    }

    /** Human-readable snapshot of the promo's terms, stored on the order. */
    private String describe(Promo p) {
        String terms = p.getDiscountType() == Promo.DiscountType.PERCENT
            ? p.getDiscountValue().stripTrailingZeros().toPlainString() + "% off"
            : "GH¢" + p.getDiscountValue().setScale(2, RoundingMode.HALF_UP) + " off";
        String where = switch (p.getScope()) {
            case VENDOR   -> "everything";
            case CATEGORY -> p.getCategory();
            case ITEM     -> menuItemRepo.findById(p.getMenuItemId()).map(MenuItem::getName).orElse("selected item");
        };
        return p.getTitle() + " (" + terms + " — " + where + ")";
    }

    /** Ensure the signed-in user owns the given vendor, returning it. */
    /**
     * An image reference must be something uploaded through the app, or nothing.
     *
     * <p>The storefront used to take any URL a vendor typed in, which meant the picture on the shop
     * card was hotlinked from wherever they found it — it could rot, or be swapped for something
     * else after the business was approved, on a page customers read. An uploaded path points at
     * bytes we hold and never rewrite.
     *
     * <p>Blank clears the image, which is how a vendor removes one.
     */
    private String imageOrNull(String url) {
        if (url == null) return null;
        String u = url.trim();
        if (u.isEmpty()) return null;
        if (!u.startsWith("/auth/uploads/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Choose a photo in the app rather than pasting a link.");
        }
        return u;
    }

    private Vendor requireOwner(String ownerId, UUID restaurantId) {
        Vendor vendor = vendorRepo.findById(restaurantId)
            .orElseThrow(() -> new IllegalStateException("Vendor not found"));
        if (!vendor.getOwnerId().equals(UUID.fromString(ownerId))) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "Not your business");
        }
        return vendor;
    }

    // ── Orders ────────────────────────────────────────────────────────────────

    public OrderResponse placeOrder(String customerId, PlaceOrderRequest req) {
        Vendor restaurant = vendorRepo.findById(req.getRestaurantId())
            .orElseThrow(() -> new IllegalStateException("Restaurant not found"));

        Order.Mode mode = Order.Mode.valueOf(req.getMode().toUpperCase());

        if (mode == Order.Mode.DELIVERY && (req.getDeliveryAddr() == null || req.getDeliveryAddr().isBlank())) {
            throw new IllegalArgumentException("deliveryAddr required for DELIVERY orders");
        }

        // A delivery order can only be fulfilled by an okada delivery rider — reject
        // up-front (rather than stranding the order) when none is available.
        if (mode == Order.Mode.DELIVERY && !authClient.deliveryRidersAvailable()) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT,
                "No delivery riders available at the time. Please choose pickup or try again shortly.");
        }

        Order order = new Order();
        order.setCustomerId(UUID.fromString(customerId));
        // Stamp who this is now, so the vendor and the courier have a name to work with rather
        // than a UUID. Fails soft to nulls — see AuthClient.identity.
        AuthClient.Identity who = authClient.identity(UUID.fromString(customerId));
        order.setCustomerName(who.name());
        order.setCustomerPhone(who.phone());
        order.setRestaurant(restaurant);
        order.setMode(mode);
        order.setDeliveryAddr(req.getDeliveryAddr());

        BigDecimal subtotal = BigDecimal.ZERO;
        for (PlaceOrderRequest.LineItem line : req.getItems()) {
            MenuItem item = menuItemRepo.findById(line.getMenuItemId())
                .orElseThrow(() -> new IllegalStateException("Menu item not found: " + line.getMenuItemId()));
            if (!item.isAvailable()) {
                throw new IllegalStateException("Item not available: " + item.getName());
            }
            OrderItem oi = new OrderItem();
            oi.setOrder(order);
            oi.setMenuItem(item);
            oi.setQty(line.getQty());

            // Resolve selected add-ons from the item's own options (price snapshot).
            BigDecimal addonSum = BigDecimal.ZERO;
            if (line.getAddonOptionIds() != null && !line.getAddonOptionIds().isEmpty()) {
                Map<UUID, AddonOption> byId = new java.util.HashMap<>();
                for (AddonGroup g : item.getGroups()) {
                    for (AddonOption o : g.getOptions()) byId.put(o.getId(), o);
                }
                for (UUID optId : line.getAddonOptionIds()) {
                    AddonOption opt = byId.get(optId);
                    if (opt == null) continue;
                    OrderItemAddon oia = new OrderItemAddon();
                    oia.setOrderItem(oi);
                    oia.setLabel(opt.getLabel());
                    oia.setPrice(opt.getPrice());
                    oi.getAddons().add(oia);
                    addonSum = addonSum.add(opt.getPrice());
                }
            }

            BigDecimal unit = item.getPrice().add(addonSum);
            oi.setUnitPrice(unit);
            order.getItems().add(oi);
            subtotal = subtotal.add(unit.multiply(BigDecimal.valueOf(line.getQty())));
        }

        // Platform fees (admin-controlled): service fee = % of subtotal; delivery fee =
        // base + per-km × distance (vendor → customer), for DELIVERY orders only.
        PlatformSettings ps = settings();
        BigDecimal deliveryFee = BigDecimal.ZERO;
        if (mode == Order.Mode.DELIVERY) {
            // Keep the destination, don't just price it. Pricing was the only thing these
            // coordinates were ever used for, so the customer's tracking map had nowhere to point.
            if (req.getDeliveryLat() != null && req.getDeliveryLng() != null) {
                order.setDeliveryLat(BigDecimal.valueOf(req.getDeliveryLat()));
                order.setDeliveryLng(BigDecimal.valueOf(req.getDeliveryLng()));
            }
            double distKm = (req.getDeliveryLat() != null && req.getDeliveryLng() != null
                    && restaurant.getLat() != null && restaurant.getLng() != null)
                ? haversineKm(restaurant.getLat().doubleValue(), restaurant.getLng().doubleValue(),
                              req.getDeliveryLat(), req.getDeliveryLng())
                : 0.0;
            deliveryFee = ps.getDeliveryBaseFee()
                .add(ps.getDeliveryPerKm().multiply(BigDecimal.valueOf(distKm)))
                .setScale(2, RoundingMode.HALF_UP);
        }
        // Promotions. A DISCOUNT promo is settled here by the platform; BOGO/OTHER
        // are fulfilled by the vendor and only recorded so both sides see the terms.
        applyPromos(order, restaurant, subtotal);
        BigDecimal discounted = subtotal.subtract(order.getDiscount());

        // The service fee is charged on what the customer actually pays for the
        // goods, i.e. after any discount — not on the pre-discount subtotal.
        BigDecimal serviceFee = discounted.multiply(ps.getServiceFeePct()).setScale(2, RoundingMode.HALF_UP);
        order.setDeliveryFee(deliveryFee);
        order.setServiceFee(serviceFee);
        order.setTotal(discounted.add(serviceFee).add(deliveryFee));
        orderRepo.save(order);

        // Auto-enqueue walk-in orders
        if (mode == Order.Mode.WALKIN) {
            joinQueue(restaurant, order);
        }

        log.info("[FOOD] order placed id={} customer={} mode={} total={}", order.getId(), customerId, mode, order.getTotal());
        return OrderResponse.from(order);
    }

    @Transactional(readOnly = true)
    public OrderResponse getOrder(UUID orderId, String userId) {
        Order order = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));
        requireOrderParticipant(order, userId);
        // The tracking screen is where the "no courier — collect or cancel?" choice is offered,
        // so this is the one read that has to know whether the search has gone stale.
        return OrderResponse.from(order, courierSearchStale(order));
    }

    /** Allow only the order's customer, the vendor owner, or the assigned courier. */
    private void requireOrderParticipant(Order order, String userId) {
        UUID u = UUID.fromString(userId);
        boolean isCustomer = order.getCustomerId().equals(u);
        boolean isOwner = order.getRestaurant().getOwnerId() != null && order.getRestaurant().getOwnerId().equals(u);
        boolean isCourier = deliveryRepo.findByOrderId(order.getId())
            .map(d -> u.equals(d.getCourierId())).orElse(false);
        if (!isCustomer && !isOwner && !isCourier) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "Not your order");
        }
    }

    @Transactional(readOnly = true)
    public List<OrderResponse> myOrders(String customerId) {
        return orderRepo.findByCustomerIdOrderByCreatedAtDesc(UUID.fromString(customerId))
            .stream().map(o -> OrderResponse.from(o, courierSearchStale(o))).toList();
    }

    /** Restaurant dashboard: all active orders for the restaurant (owner only). */
    @Transactional(readOnly = true)
    public List<OrderResponse> restaurantOrders(String ownerId, UUID restaurantId) {
        requireOwner(ownerId, restaurantId);
        return orderRepo.findByRestaurantIdAndStatusNotOrderByCreatedAtDesc(restaurantId, Order.Status.COMPLETED)
            .stream().map(OrderResponse::from).toList();
    }

    /** Restaurant owner advances order status. */
    public OrderResponse advanceStatus(UUID orderId, String ownerId, AdvanceStatusRequest req) {
        Order order = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));
        requireOwner(ownerId, order.getRestaurant().getId());

        Order.Status newStatus = Order.Status.valueOf(req.getStatus().toUpperCase());

        // A delivery order stops being the vendor's to move once the food is ready: the courier
        // collects it, and the courier's own "picked up" / "delivered" updates drive the rest.
        // The kitchen cannot mark food delivered that it never carried.
        if (order.getMode() == Order.Mode.DELIVERY
                && (newStatus == Order.Status.OUT_FOR_DELIVERY || newStatus == Order.Status.COMPLETED)) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN,
                "The courier updates this order once they collect it.");
        }

        validateOrderTransition(order.getStatus(), newStatus, order.getMode());
        order.setStatus(newStatus);
        // Start the cooking clock, which is what the collection estimate counts down against.
        // Only on the first entry into PREPARING — a re-entry must not reset a customer's wait.
        if (newStatus == Order.Status.PREPARING && order.getPreparingAt() == null) {
            order.setPreparingAt(OffsetDateTime.now());
        }
        orderRepo.save(order);

        // On READY for delivery orders, create delivery record (courier assignment is manual in demo)
        if (newStatus == Order.Status.READY && order.getMode() == Order.Mode.DELIVERY) {
            if (deliveryRepo.findByOrderId(order.getId()).isEmpty()) {
                Delivery delivery = new Delivery();
                delivery.setOrder(order);
                delivery.setAssignedAt(OffsetDateTime.now());
                deliveryRepo.save(delivery);
                log.info("[FOOD] delivery created for order={}", orderId);
            }
        }

        // Tell the customer, because for everything except a delivery the next move is theirs and
        // they are not sitting in the app waiting to be told. A pickup customer has to set off; a
        // walk-in customer is holding a place in a queue they cannot see.
        if (newStatus == Order.Status.READY) {
            notifyOrderReady(order);
        }

        if (newStatus == Order.Status.COMPLETED) {
            onOrderCompleted(order);
        }

        // A cancelled walk-in must leave the queue, otherwise the vendor keeps
        // seeing (and can "call next" on) a customer who is no longer coming.
        if (newStatus == Order.Status.CANCELLED && order.getMode() == Order.Mode.WALKIN) {
            queueRepo.findByOrderId(order.getId()).ifPresent(entry -> {
                if (entry.getStatus() != QueueEntry.Status.SERVED) {
                    entry.setStatus(QueueEntry.Status.SERVED);
                    queueRepo.save(entry);
                    log.info("[FOOD] queue entry {} cleared — order {} cancelled", entry.getId(), orderId);
                }
            });
        }

        // Broadcast queue update for walkin
        if (order.getMode() == Order.Mode.WALKIN) {
            broadcastQueueUpdate(order.getRestaurant().getId());
        }

        return OrderResponse.from(order);
    }

    /**
     * "Your food is ready" — worded for how the customer actually gets it.
     *
     * Fail-soft via NotifyClient: a notification outage must never fail the vendor's status
     * update, which is the thing the kitchen is standing there waiting on.
     */
    private void notifyOrderReady(Order order) {
        String vendor = order.getRestaurant().getName();
        switch (order.getMode()) {
            case PICKUP -> notifyClient.send(order.getCustomerId(),
                "Your order is ready",
                "Your order from " + vendor + " is ready for collection.");
            case WALKIN -> notifyClient.send(order.getCustomerId(),
                "Your table is ready",
                "Your order at " + vendor + " is ready — head to the counter.");
            // A delivery customer is not going anywhere; the courier is. They already have live
            // tracking, and telling them the kitchen is done is noise.
            case DELIVERY -> { }
        }
    }

    // ── Payment ─────────────────────────────────────────────────────────────────

    /**
     * Customer pays. A non-blank {@code reference} means a Paystack (card/mobile-money) payment,
     * verified server-side before the order is marked paid. Wallet settles now; cash awaits
     * the vendor/courier.
     */
    public OrderResponse payOrder(UUID orderId, String customerId, String method, String reference) {
        Order o = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));
        if (!o.getCustomerId().equals(UUID.fromString(customerId))) {
            throw new IllegalStateException("Not your order");
        }

        boolean viaPaystack = reference != null && !reference.isBlank();
        if (viaPaystack && !walletClient.verifyPayment(o.getTotal(), reference)) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.PAYMENT_REQUIRED,
                "Payment could not be verified. If you completed it, please try again.");
        }

        // Paying from the GoZone wallet has to actually take the money. This throws (402) when
        // the balance won't cover it, before anything is marked paid — an empty wallet used to
        // sail straight through and the vendor was credited anyway.
        boolean viaWallet = !viaPaystack && "wallet".equalsIgnoreCase(method);
        if (viaWallet) {
            walletClient.chargeWallet(o.getCustomerId(), o.getTotal(), o.getId());
        }

        o.setPaymentMethod(method);
        o.setPaymentStatus((!viaPaystack && "cash".equalsIgnoreCase(method))
            ? Order.PaymentStatus.AWAITING
            : Order.PaymentStatus.PAID);
        orderRepo.save(o);
        settleOrderIfPaid(o); // pays the vendor once a completed order is paid
        log.info("[PAY] order={} method={} status={}", orderId, method, o.getPaymentStatus());
        return OrderResponse.from(o);
    }

    /**
     * Whoever actually took the cash confirms it: the courier on a delivery, the vendor otherwise.
     *
     * <p>The owner used to be allowed either way, which let them mark a delivery paid without the
     * money existing — the customer pays at their door, to the courier. Hiding those orders from
     * the vendor's board without closing this would only have moved the problem out of sight.
     */
    public OrderResponse confirmOrderCash(UUID orderId, String userId) {
        Order o = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));
        UUID u = UUID.fromString(userId);
        boolean delivery = o.getMode() == Order.Mode.DELIVERY;
        boolean isOwner = !delivery
            && o.getRestaurant().getOwnerId() != null && o.getRestaurant().getOwnerId().equals(u);
        boolean isCourier = deliveryRepo.findByOrderId(orderId).map(d -> u.equals(d.getCourierId())).orElse(false);
        if (!isOwner && !isCourier) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN,
                delivery ? "The courier collects the cash on a delivery." : "Not your order");
        }
        o.setPaymentStatus(Order.PaymentStatus.PAID);
        orderRepo.save(o);
        settleOrderIfPaid(o);
        log.info("[PAY] order={} cash confirmed by {}", orderId, userId);
        return OrderResponse.from(o);
    }

    /**
     * Orders awaiting a cash confirmation from this vendor (owner only).
     *
     * <p><b>Delivery orders are excluded.</b> The vendor never touches that money — the courier
     * collects it at the door and confirms it themselves through
     * {@code POST /food/deliveries/{id}/confirm-cash}. Listing those here asked the vendor to
     * confirm receipt of cash that had not been handed to them and never would be, and either
     * answer was wrong: confirming was a lie, and not confirming left the order unpaid.
     *
     * <p>Pickup and walk-in stay, because there the vendor really is the one taking the money.
     * The vendor's own earnings do not depend on any of this — they are credited when the order
     * settles, whichever way the customer paid.
     */
    @Transactional(readOnly = true)
    public List<OrderResponse> awaitingCashOrders(String ownerId, UUID restaurantId) {
        requireOwner(ownerId, restaurantId);
        return orderRepo.findByRestaurantIdAndPaymentStatusOrderByCreatedAtDesc(restaurantId, Order.PaymentStatus.AWAITING)
            .stream()
            .filter(o -> o.getMode() != Order.Mode.DELIVERY)
            .map(OrderResponse::from).toList();
    }

    // ── Timeouts ───────────────────────────────────────────────────────────────

    /** How long a vendor has to confirm before the order is given up on. */
    @Value("${app.orders.confirm-timeout-minutes:5}")
    private int confirmTimeoutMinutes;

    /** How long to look for a courier before offering the customer a way out. */
    @Value("${app.orders.courier-timeout-minutes:2}")
    private int courierTimeoutMinutes;

    /**
     * Cancel orders the vendor never confirmed.
     *
     * <p>An unconfirmed order used to sit on the customer's screen as "placed" indefinitely and on
     * the vendor's board as live work nobody was doing. Only PLACED is swept: once a vendor has
     * confirmed, the order is somebody's responsibility and a clock should not take it away from
     * them mid-cook.
     *
     * <p>The reason is stored rather than left blank, because a cancellation with no explanation
     * is indistinguishable from the app losing the order.
     */
    @Scheduled(fixedDelayString = "${app.orders.sweep-ms:30000}")
    @Transactional
    public void cancelUnconfirmedOrders() {
        OffsetDateTime cutoff = OffsetDateTime.now().minusMinutes(confirmTimeoutMinutes);
        for (Order o : orderRepo.findByStatusAndCreatedAtBefore(Order.Status.PLACED, cutoff)) {
            o.setStatus(Order.Status.CANCELLED);
            o.setCancelReason("The vendor was busy and couldn’t confirm your order in time.");
            orderRepo.save(o);
            log.info("[FOOD] order {} auto-cancelled — vendor did not confirm within {}m",
                o.getId(), confirmTimeoutMinutes);
            notifyClient.send(o.getCustomerId(), "Order cancelled",
                o.getRestaurant().getName() + " couldn’t confirm your order in time. You haven’t been charged.");
        }
    }

    /**
     * Has this delivery been looking for a courier longer than we are willing to make someone wait?
     *
     * <p>Read by {@link OrderResponse}, not acted on by a sweep: nothing should be cancelled
     * automatically here. The customer chooses between collecting it themselves and cancelling,
     * and only they can make that call — the food may already be cooked.
     */
    private boolean courierSearchStale(Order o) {
        if (o.getMode() != Order.Mode.DELIVERY) return false;
        return deliveryRepo.findByOrderId(o.getId())
            .filter(d -> d.getCourierId() == null)
            .filter(d -> d.getAssignedAt() != null
                && d.getAssignedAt().isBefore(OffsetDateTime.now().minusMinutes(courierTimeoutMinutes)))
            .isPresent();
    }

    /**
     * Customer gives up on a courier and collects the order themselves.
     *
     * <p>Only offered once the search has actually gone stale, and only while no courier has taken
     * it — a courier already riding to the vendor must not have the job pulled from under them.
     * The delivery fee is refunded to the total, because they are now doing that leg.
     */
    public OrderResponse switchToPickup(UUID orderId, String customerId) {
        Order o = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));
        if (!o.getCustomerId().equals(UUID.fromString(customerId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your order");
        }
        if (o.getMode() != Order.Mode.DELIVERY) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This order isn’t a delivery.");
        }
        Delivery d = deliveryRepo.findByOrderId(orderId).orElse(null);
        if (d != null && d.getCourierId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "A courier is already on the way with this order.");
        }
        o.setMode(Order.Mode.PICKUP);
        // They are riding the last leg themselves, so the fee they paid for it comes off.
        if (o.getDeliveryFee() != null && o.getDeliveryFee().signum() > 0) {
            o.setTotal(o.getTotal().subtract(o.getDeliveryFee()));
            o.setDeliveryFee(BigDecimal.ZERO);
        }
        orderRepo.save(o);
        if (d != null) deliveryRepo.delete(d);
        log.info("[FOOD] order {} switched to pickup — no courier found", orderId);
        return OrderResponse.from(o, false);
    }

    /**
     * The customer calls off their own order.
     *
     * <p>Allowed until a courier has physically taken it — after that the food is on the road and
     * cancelling is a refund question, which is not built. No reason is recorded: unlike the
     * timeout sweeps, the person reading the cancellation is the one who caused it.
     */
    public OrderResponse cancelOrder(UUID orderId, String customerId) {
        Order o = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));
        if (!o.getCustomerId().equals(UUID.fromString(customerId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your order");
        }
        if (o.getStatus() == Order.Status.COMPLETED || o.getStatus() == Order.Status.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This order is already finished.");
        }
        Delivery d = deliveryRepo.findByOrderId(orderId).orElse(null);
        if (d != null && d.getCourierId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "A courier has already collected this order.");
        }
        o.setStatus(Order.Status.CANCELLED);
        orderRepo.save(o);
        if (d != null) deliveryRepo.delete(d);
        log.info("[FOOD] order {} cancelled by customer", orderId);
        notifyClient.send(o.getRestaurant().getOwnerId(), "Order cancelled",
            "A customer cancelled their order.");
        return OrderResponse.from(o);
    }

    // ── Delivery courier (driver app) ──────────────────────────────────────────

    /**
     * Couriers see unassigned deliveries to pick up — excluding cancelled orders.
     *
     * <p>The exclusion is the fix for a job that kept coming back: a cancelled order's delivery
     * row survives, and the old finder returned it, so the courier feed offered work that could
     * never be completed. Accepting one would have been a wasted trip.
     */
    @Transactional(readOnly = true)
    public List<DeliveryResponse> listAvailableDeliveries() {
        return deliveryRepo
            .findByCourierIdIsNullAndOrderStatusNotOrderByAssignedAtDesc(Order.Status.CANCELLED)
            .stream().map(DeliveryResponse::from).toList();
    }

    /** A courier's own deliveries. */
    @Transactional(readOnly = true)
    public List<DeliveryResponse> myDeliveries(String courierId) {
        return deliveryRepo.findByCourierIdOrderByAssignedAtDesc(UUID.fromString(courierId))
            .stream().map(DeliveryResponse::from).toList();
    }

    /** Courier claims an unassigned delivery. */
    public DeliveryResponse acceptDelivery(UUID deliveryId, String courierId) {
        Delivery delivery = deliveryRepo.findById(deliveryId)
            .orElseThrow(() -> new IllegalStateException("Delivery not found"));
        if (delivery.getCourierId() != null) {
            throw new IllegalStateException("Delivery already taken");
        }

        // A courier holding GoZone's cash from earlier deliveries can't take another cash job
        // until they've paid it in — otherwise the amount they're carrying just keeps growing.
        // Prepaid orders stay open to them, so they can still earn their way out of the debt.
        Order order = delivery.getOrder();
        if ("cash".equalsIgnoreCase(order.getPaymentMethod())
                && order.getPaymentStatus() != Order.PaymentStatus.PAID) {
            BigDecimal owed = walletClient.courierBalance(UUID.fromString(courierId));
            if (owed != null && owed.signum() < 0) {
                throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "You owe GoZone GH₵ " + owed.abs().toPlainString()
                        + " from cash collected. Pay it in to take cash orders again.");
            }
        }

        delivery.setCourierId(UUID.fromString(courierId));
        deliveryRepo.save(delivery);
        log.info("[FOOD] delivery {} accepted by courier {}", deliveryId, courierId);
        return DeliveryResponse.from(delivery);
    }

    /** Courier pushes location — broadcast on the ORDER id so the customer (who only
     *  knows the order id) receives it on /topic/delivery/{orderId}/location. */
    public void updateDeliveryLocation(String courierId, CourierLocationUpdate dto) {
        Delivery delivery = deliveryRepo.findById(dto.getDeliveryId())
            .orElseThrow(() -> new IllegalStateException("Delivery not found"));
        if (!UUID.fromString(courierId).equals(delivery.getCourierId())) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "Not your delivery");
        }
        UUID topicKey = delivery.getOrder().getId();
        messaging.convertAndSend(
            "/topic/delivery/" + topicKey + "/location",
            Map.of("lat", dto.getLat(), "lng", dto.getLng(), "courierId", courierId)
        );
        log.debug("[FOOD] courier loc delivery={} order={} lat={} lng={}", dto.getDeliveryId(), topicKey, dto.getLat(), dto.getLng());
    }

    public void advanceDeliveryStatus(UUID deliveryId, String courierId, String status) {
        Delivery delivery = deliveryRepo.findById(deliveryId)
            .orElseThrow(() -> new IllegalStateException("Delivery not found"));
        if (!UUID.fromString(courierId).equals(delivery.getCourierId())) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "Not your delivery");
        }

        Delivery.Status newStatus = Delivery.Status.valueOf(status.toUpperCase());
        delivery.setStatus(newStatus);
        Order order = delivery.getOrder();

        // The courier's progress is what moves the order now, so the customer and the vendor
        // both see the real state of the food: on the road once it's collected, completed only
        // when it's actually handed over.
        if (newStatus == Delivery.Status.PICKED_UP && order.getStatus() == Order.Status.READY) {
            order.setStatus(Order.Status.OUT_FOR_DELIVERY);
            orderRepo.save(order);
            // The moment worth telling a delivery customer about is the food leaving, not the
            // kitchen finishing — this is when the tracking map starts meaning something.
            notifyClient.send(order.getCustomerId(), "Your order is on the way",
                "Your order from " + order.getRestaurant().getName() + " has left and is on its way to you.");
            log.info("[FOOD] order={} out for delivery — collected by courier {}", order.getId(), courierId);
        }

        if (newStatus == Delivery.Status.DELIVERED) {
            delivery.setDeliveredAt(OffsetDateTime.now());
            order.setStatus(Order.Status.COMPLETED);
            orderRepo.save(order);
            onOrderCompleted(order);
        }
        deliveryRepo.save(delivery);
    }

    /** Courier confirms cash collected on hand-off for their own delivery order. */
    public DeliveryResponse confirmDeliveryCash(UUID deliveryId, String courierId) {
        Delivery delivery = deliveryRepo.findById(deliveryId)
            .orElseThrow(() -> new IllegalStateException("Delivery not found"));
        if (delivery.getCourierId() == null
                || !delivery.getCourierId().equals(UUID.fromString(courierId))) {
            throw new IllegalStateException("Not your delivery");
        }
        Order order = delivery.getOrder();
        if (!"cash".equalsIgnoreCase(order.getPaymentMethod())) {
            throw new IllegalStateException("Order is not a cash payment");
        }
        order.setPaymentStatus(Order.PaymentStatus.PAID);
        orderRepo.save(order);
        settleOrderIfPaid(order);
        log.info("[PAY] order={} delivery={} cash confirmed by courier {}", order.getId(), deliveryId, courierId);
        return DeliveryResponse.from(delivery);
    }

    // ── Walk-in queue ─────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<QueuePositionResponse> getQueue(UUID restaurantId) {
        return queueRepo.findByRestaurantIdAndStatusOrderByPosition(restaurantId, QueueEntry.Status.WAITING)
            .stream()
            .map(e -> new QueuePositionResponse(
                e.getId(), e.getPosition(), e.getStatus().name(),
                e.getOrder() != null ? e.getOrder().getId() : null))
            .toList();
    }

    @Transactional(readOnly = true)
    public QueuePositionResponse myQueuePosition(UUID orderId) {
        QueueEntry entry = queueRepo.findByOrderId(orderId)
            .orElseThrow(() -> new IllegalStateException("No queue entry for this order"));
        return new QueuePositionResponse(
            entry.getId(), entry.getPosition(), entry.getStatus().name(), orderId);
    }

    /** Restaurant staff calls next in queue (owner only). */
    public QueuePositionResponse callNext(String ownerId, UUID restaurantId) {
        requireOwner(ownerId, restaurantId);
        List<QueueEntry> waiting =
            queueRepo.findByRestaurantIdAndStatusOrderByPosition(restaurantId, QueueEntry.Status.WAITING);

        if (waiting.isEmpty()) throw new IllegalStateException("Queue is empty");

        QueueEntry next = waiting.get(0);
        next.setStatus(QueueEntry.Status.CALLED);
        queueRepo.save(next);

        broadcastQueueUpdate(restaurantId);

        return new QueuePositionResponse(next.getId(), next.getPosition(),
            next.getStatus().name(), next.getOrder() != null ? next.getOrder().getId() : null);
    }

    /** Mark queue entry as served (owner only). */
    public void serveQueueEntry(String ownerId, UUID entryId) {
        QueueEntry entry = queueRepo.findById(entryId)
            .orElseThrow(() -> new IllegalStateException("Queue entry not found"));
        requireOwner(ownerId, entry.getRestaurant().getId());
        entry.setStatus(QueueEntry.Status.SERVED);
        queueRepo.save(entry);
        broadcastQueueUpdate(entry.getRestaurant().getId());
    }

    // ── Ratings ───────────────────────────────────────────────────────────────

    public void rateOrder(UUID orderId, String userId, RateFoodRequest req) {
        Order order0 = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));
        if (!order0.getCustomerId().equals(UUID.fromString(userId))) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "Not your order");
        }
        if (ratingRepo.existsByOrderId(orderId)) {
            throw new IllegalStateException("Already rated this order");
        }
        Order order = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));
        if (order.getStatus() != Order.Status.COMPLETED) {
            throw new IllegalStateException("Can only rate completed orders");
        }
        FoodRating rating = new FoodRating();
        rating.setOrder(order);
        rating.setScore(req.getScore());
        rating.setComment(req.getComment());
        ratingRepo.save(rating);
    }

    // ── Platform fees (admin-controlled) ────────────────────────────────────────

    @Transactional(readOnly = true)
    public PlatformFeesResponse getPlatformFees() {
        PlatformSettings s = settings();
        return new PlatformFeesResponse(s.getServiceFeePct(), s.getDeliveryBaseFee(), s.getDeliveryPerKm());
    }

    public PlatformFeesResponse updatePlatformFees(UpdatePlatformFeesRequest req) {
        PlatformSettings s = settings();
        s.setId((short) 1);
        if (req.getServiceFeePct() != null)   s.setServiceFeePct(req.getServiceFeePct());
        if (req.getDeliveryBaseFee() != null) s.setDeliveryBaseFee(req.getDeliveryBaseFee());
        if (req.getDeliveryPerKm() != null)   s.setDeliveryPerKm(req.getDeliveryPerKm());
        settingsRepo.save(s);
        log.info("[FEES] updated service={}% base={} perKm={}",
            s.getServiceFeePct(), s.getDeliveryBaseFee(), s.getDeliveryPerKm());
        return new PlatformFeesResponse(s.getServiceFeePct(), s.getDeliveryBaseFee(), s.getDeliveryPerKm());
    }

    /** The singleton settings row, falling back to config defaults if it's somehow missing. */
    private PlatformSettings settings() {
        return settingsRepo.findById((short) 1).orElseGet(() -> {
            PlatformSettings s = new PlatformSettings();
            s.setId((short) 1);
            s.setServiceFeePct(new BigDecimal("0.05"));
            s.setDeliveryBaseFee(deliveryBaseFee);
            s.setDeliveryPerKm(deliveryFeePerKm);
            return s;
        });
    }

    /** Haversine great-circle distance in km. */
    private static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
        double R = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
            * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // ── private helpers ───────────────────────────────────────────────────────

    private void joinQueue(Vendor restaurant, Order order) {
        int nextPos = queueRepo.maxPositionForRestaurant(restaurant.getId()) + 1;
        QueueEntry entry = new QueueEntry();
        entry.setRestaurant(restaurant);
        entry.setOrder(order);
        entry.setPosition(nextPos);
        queueRepo.save(entry);
        log.info("[QUEUE] entry pos={} restaurant={} order={}", nextPos, restaurant.getId(), order.getId());
        broadcastQueueUpdate(restaurant.getId());
    }

    // ── Walk-in: when should I leave? ────────────────────────────────────────────

    /** Average city speed used to turn distance into minutes. Accra traffic, not open road. */
    private static final double CITY_KMH = 18.0;
    /** Padding so "leave now" is not the exact second you would arrive late. */
    private static final int BUFFER_MINUTES = 5;

    /**
     * How long until a collection order's food is ready, and when the customer should set off.
     *
     * <p>Covers walk-in and pickup — both mean somebody has to travel to the counter, which is the
     * only reason this figure exists. A walk-in is closer to a table booking than a takeaway:
     * people are queued behind them, and arriving too early means standing about while arriving
     * late costs them their place. A pickup carries no queue, so the wait is just their own food.
     * Either way the useful answer is not "your food is ready" — by then they are already late —
     * but "leave now". A delivery order is nobody's journey but the courier's, hence the refusal.
     *
     * <p>Location is passed in rather than stored, because it is the customer's location *now*
     * that matters; where they were when they ordered is beside the point. It is optional: with
     * no coordinates the travel leg is simply left out and they still get a ready time.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> collectionLeaveTime(UUID orderId, String customerId, Double lat, Double lng) {
        Order order = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));
        if (!order.getCustomerId().equals(UUID.fromString(customerId))) {
            throw new IllegalStateException("Not your order");
        }
        if (order.getMode() == Order.Mode.DELIVERY) {
            // Explicit status: there is no exception handler in this service, so a bare
            // IllegalStateException would reach the caller as an opaque 500.
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT,
                "A delivery order is brought to you — there is nothing to set off for.");
        }

        QueueEntry entry = queueRepo.findByOrderId(orderId).orElse(null);
        Vendor vendor = order.getRestaurant();
        int prep = Math.max(1, vendor.getPrepMinutes());

        // How many are genuinely in front of them right now — not their original ticket number,
        // which stops being true the moment somebody ahead is served or cancels.
        int ahead = 0;
        if (entry != null && entry.getStatus() == QueueEntry.Status.WAITING) {
            ahead = (int) queueRepo
                .findByRestaurantIdAndStatusOrderByPosition(vendor.getId(), QueueEntry.Status.WAITING)
                .stream().filter(q -> q.getPosition() < entry.getPosition()).count();
        }

        // This order's own prep time: the slowest dish on it, not the sum. A kitchen cooks in
        // parallel, so three dishes do not take three times as long — but they do take a little
        // longer than one, hence the small margin per extra dish. Items with no time of their own
        // fall back to the vendor's flat figure.
        int ownPrep = order.getItems().isEmpty() ? prep
            : order.getItems().stream()
                .mapToInt(li -> li.getMenuItem() != null && li.getMenuItem().getPrepMinutes() != null
                    ? li.getMenuItem().getPrepMinutes() : prep)
                .max().orElse(prep)
              + Math.min(10, Math.max(0, order.getItems().size() - 1) * 2);

        // Once the kitchen has started, the queue no longer applies to them and the only thing
        // left is their own food — minus however long it has already been cooking. Without that
        // subtraction the figure stood still while the vendor worked, which is what made it look
        // broken. Elapsed is floored, so the estimate never falls faster than the clock.
        int cookedFor = 0;
        if (order.getPreparingAt() != null) {
            cookedFor = (int) java.time.Duration.between(order.getPreparingAt(), OffsetDateTime.now()).toMinutes();
            cookedFor = Math.max(0, cookedFor);
        }
        boolean cooking = order.getStatus() == Order.Status.PREPARING
                       || order.getStatus() == Order.Status.READY;
        // People ahead are queued with orders of their own, which we cannot see from here, so
        // they are costed at the vendor's average rather than pretending to know their dishes.
        // A kitchen running over its own estimate floors at 1, not 0: "ready in 0 min" on food
        // that is demonstrably not ready reads as a lie, and READY is the only honest zero.
        int readyIn = order.getStatus() == Order.Status.READY ? 0
                    : cooking ? Math.max(1, ownPrep - cookedFor)
                    : ahead * prep + ownPrep;

        Integer travel = null;
        if (lat != null && lng != null && vendor.getLat() != null && vendor.getLng() != null) {
            double km = haversineKm(lat, lng, vendor.getLat().doubleValue(), vendor.getLng().doubleValue());
            travel = (int) Math.ceil((km / CITY_KMH) * 60);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orderId", orderId.toString());
        out.put("position", entry != null ? entry.getPosition() : null);
        out.put("peopleAhead", ahead);
        out.put("readyInMinutes", readyIn);
        out.put("travelMinutes", travel);
        // Negative means they are already late to set off — the app should say "leave now".
        out.put("leaveInMinutes", travel == null ? null : readyIn - travel - BUFFER_MINUTES);
        out.put("status", order.getStatus().name());
        return out;
    }

    private void broadcastQueueUpdate(UUID restaurantId) {
        List<QueueEntry> waiting =
            queueRepo.findByRestaurantIdAndStatusOrderByPosition(restaurantId, QueueEntry.Status.WAITING);
        messaging.convertAndSend(
            "/topic/queue/" + restaurantId,
            Map.of("restaurantId", restaurantId.toString(), "queueLength", waiting.size())
        );
    }

    private void validateOrderTransition(Order.Status current, Order.Status next, Order.Mode mode) {
        boolean valid = switch (current) {
            case PLACED          -> next == Order.Status.CONFIRMED || next == Order.Status.CANCELLED;
            case CONFIRMED       -> next == Order.Status.PREPARING || next == Order.Status.CANCELLED;
            case PREPARING       -> next == Order.Status.READY;
            case READY           -> (mode == Order.Mode.DELIVERY)
                                      ? next == Order.Status.OUT_FOR_DELIVERY
                                      : next == Order.Status.COMPLETED;
            case OUT_FOR_DELIVERY -> next == Order.Status.COMPLETED;
            default -> false;
        };
        if (!valid) {
            throw new IllegalStateException("Invalid order transition: " + current + " → " + next);
        }
    }

    private void onOrderCompleted(Order order) {
        settleOrderIfPaid(order);
    }

    /**
     * Settle an order only once it is BOTH completed AND paid — so a vendor can't credit
     * themselves by advancing status while the customer hasn't paid. Idempotent in wallet,
     * so completion and payment can each trigger it safely.
     */
    private void settleOrderIfPaid(Order order) {
        if (order.getStatus() != Order.Status.COMPLETED
                || order.getPaymentStatus() != Order.PaymentStatus.PAID) {
            return;
        }
        // Who gets what: the vendor is paid for the goods only, the courier for the delivery,
        // GoZone takes commission + the service fee. Sending just the total used to hand the
        // vendor the courier's delivery fee as well.
        BigDecimal goods = order.getTotal()
            .subtract(order.getServiceFee() == null ? BigDecimal.ZERO : order.getServiceFee())
            .subtract(order.getDeliveryFee() == null ? BigDecimal.ZERO : order.getDeliveryFee());

        UUID courierId = deliveryRepo.findByOrderId(order.getId())
            .map(Delivery::getCourierId)
            .orElse(null);

        // On a cash order the courier walked away with the customer's money, so they owe GoZone
        // what they collected (see WalletService.settleOrder).
        BigDecimal cashCollected = "cash".equalsIgnoreCase(order.getPaymentMethod()) && courierId != null
            ? order.getTotal()
            : null;

        // Credit the vendor's OWNER (user id), not the vendor entity id — the wallet/earnings
        // screens query the wallet by the signed-in user's id (like RIDER/DRIVER wallets).
        walletClient.settleOrder(order.getId(), order.getRestaurant().getOwnerId(), order.getTotal(),
            goods, order.getServiceFee(), order.getDeliveryFee(), courierId, cashCollected);
    }
}
