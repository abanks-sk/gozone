package com.gozone.food.service;

import com.gozone.food.dto.*;
import com.gozone.food.model.*;
import com.gozone.food.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
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
        this.authClient     = authClient;
    }

    // ── Restaurants ───────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<VendorResponse> listOpenRestaurants() {
        return vendorRepo.findByStatus(Vendor.Status.OPEN)
            .stream().map(VendorResponse::from).toList();
    }

    /** Vendor onboarding: create the owner's business record. */
    public VendorResponse createVendor(String ownerId, CreateVendorRequest req) {
        Vendor v = new Vendor();
        v.setOwnerId(UUID.fromString(ownerId));
        v.setName(req.getName().trim());
        v.setVendorType(Vendor.VendorType.valueOf(req.getVendorType().toUpperCase()));
        v.setLat(BigDecimal.valueOf(req.getLat()));
        v.setLng(BigDecimal.valueOf(req.getLng()));
        vendorRepo.save(v);
        log.info("[VENDOR] created vendor {} type={} owner={}", v.getId(), v.getVendorType(), ownerId);
        return VendorResponse.from(v);
    }

    /** The signed-in owner's businesses. */
    @Transactional(readOnly = true)
    public List<VendorResponse> myVendors(String ownerId) {
        return vendorRepo.findByOwnerId(UUID.fromString(ownerId))
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
        menuItemRepo.save(item);
        log.info("[MENU] item created {} for vendor {}", item.getId(), restaurantId);
        return MenuItemResponse.from(item);
    }

    /** Vendor edits one of their items. */
    public MenuItemResponse updateMenuItem(String ownerId, UUID itemId, UpdateMenuItemRequest req) {
        MenuItem item = menuItemRepo.findById(itemId)
            .orElseThrow(() -> new IllegalStateException("Menu item not found"));
        requireOwner(ownerId, item.getRestaurant().getId());
        if (req.getName() != null && !req.getName().isBlank()) item.setName(req.getName().trim());
        if (req.getDescription() != null) item.setDescription(req.getDescription().trim());
        if (req.getCategory() != null) item.setCategory(req.getCategory().isBlank() ? null : req.getCategory().trim());
        if (req.getPrice() != null) item.setPrice(req.getPrice());
        if (req.getAvailable() != null) item.setAvailable(req.getAvailable());
        menuItemRepo.save(item);
        return MenuItemResponse.from(item);
    }

    /** Vendor removes one of their items. */
    public void deleteMenuItem(String ownerId, UUID itemId) {
        MenuItem item = menuItemRepo.findById(itemId)
            .orElseThrow(() -> new IllegalStateException("Menu item not found"));
        requireOwner(ownerId, item.getRestaurant().getId());
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
        return OrderResponse.from(order);
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
            .stream().map(OrderResponse::from).toList();
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
        validateOrderTransition(order.getStatus(), newStatus, order.getMode());
        order.setStatus(newStatus);
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

        o.setPaymentMethod(method);
        o.setPaymentStatus((!viaPaystack && "cash".equalsIgnoreCase(method))
            ? Order.PaymentStatus.AWAITING
            : Order.PaymentStatus.PAID);
        orderRepo.save(o);
        settleOrderIfPaid(o); // pays the vendor once a completed order is paid
        log.info("[PAY] order={} method={} status={}", orderId, method, o.getPaymentStatus());
        return OrderResponse.from(o);
    }

    /** Vendor (owner) or the assigned courier confirms cash received for an order. */
    public OrderResponse confirmOrderCash(UUID orderId, String userId) {
        Order o = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));
        UUID u = UUID.fromString(userId);
        boolean isOwner = o.getRestaurant().getOwnerId() != null && o.getRestaurant().getOwnerId().equals(u);
        boolean isCourier = deliveryRepo.findByOrderId(orderId).map(d -> u.equals(d.getCourierId())).orElse(false);
        if (!isOwner && !isCourier) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "Not your order");
        }
        o.setPaymentStatus(Order.PaymentStatus.PAID);
        orderRepo.save(o);
        settleOrderIfPaid(o);
        log.info("[PAY] order={} cash confirmed by {}", orderId, userId);
        return OrderResponse.from(o);
    }

    /** Orders awaiting a cash confirmation for a vendor (owner only). */
    @Transactional(readOnly = true)
    public List<OrderResponse> awaitingCashOrders(String ownerId, UUID restaurantId) {
        requireOwner(ownerId, restaurantId);
        return orderRepo.findByRestaurantIdAndPaymentStatusOrderByCreatedAtDesc(restaurantId, Order.PaymentStatus.AWAITING)
            .stream().map(OrderResponse::from).toList();
    }

    // ── Delivery courier (driver app) ──────────────────────────────────────────

    /** Couriers see unassigned deliveries to pick up. */
    @Transactional(readOnly = true)
    public List<DeliveryResponse> listAvailableDeliveries() {
        return deliveryRepo.findByCourierIdIsNullOrderByAssignedAtDesc()
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

        if (newStatus == Delivery.Status.DELIVERED) {
            delivery.setDeliveredAt(OffsetDateTime.now());
            // Advance order to COMPLETED
            Order order = delivery.getOrder();
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
        if (order.getStatus() == Order.Status.COMPLETED
                && order.getPaymentStatus() == Order.PaymentStatus.PAID) {
            // Credit the vendor's OWNER (user id), not the vendor entity id — the wallet/earnings
            // screens query the wallet by the signed-in user's id (like RIDER/DRIVER wallets).
            walletClient.settleOrder(order.getId(), order.getRestaurant().getOwnerId(), order.getTotal());
        }
    }
}
