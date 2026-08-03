package com.gozone.food.controller;

import com.gozone.food.dto.*;
import com.gozone.food.service.FoodService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Food endpoints. Context-path is /food.
 */
@RestController
public class FoodController {

    private final FoodService foodService;

    public FoodController(FoodService foodService) {
        this.foodService = foodService;
    }

    // ── Restaurants ───────────────────────────────────────────────────────────

    @GetMapping("/restaurants")
    public ResponseEntity<List<VendorResponse>> listRestaurants() {
        return ResponseEntity.ok(foodService.listOpenRestaurants());
    }

    @GetMapping("/restaurants/{id}/menu")
    public ResponseEntity<List<MenuItemResponse>> getMenu(@PathVariable UUID id) {
        return ResponseEntity.ok(foodService.getMenu(id));
    }

    // ── Vendor catalogue management (owner-authorised) ──────────────────────────

    @GetMapping("/restaurants/{id}/catalogue")
    public ResponseEntity<List<MenuItemResponse>> catalogue(
            @PathVariable UUID id, @AuthenticationPrincipal String ownerId) {
        return ResponseEntity.ok(foodService.getCatalogue(ownerId, id));
    }

    @PostMapping("/restaurants/{id}/menu")
    public ResponseEntity<MenuItemResponse> createMenuItem(
            @PathVariable UUID id, @AuthenticationPrincipal String ownerId,
            @Valid @RequestBody CreateMenuItemRequest req) {
        return ResponseEntity.ok(foodService.createMenuItem(ownerId, id, req));
    }

    @PatchMapping("/menu-items/{id}")
    public ResponseEntity<MenuItemResponse> updateMenuItem(
            @PathVariable UUID id, @AuthenticationPrincipal String ownerId,
            @RequestBody UpdateMenuItemRequest req) {
        return ResponseEntity.ok(foodService.updateMenuItem(ownerId, id, req));
    }

    @DeleteMapping("/menu-items/{id}")
    public ResponseEntity<Void> deleteMenuItem(
            @PathVariable UUID id, @AuthenticationPrincipal String ownerId) {
        foodService.deleteMenuItem(ownerId, id);
        return ResponseEntity.noContent().build();
    }

    // ── Vendor onboarding ───────────────────────────────────────────────────────

    @PostMapping("/vendors")
    @PreAuthorize("hasRole('RESTAURANT_OWNER')")
    public ResponseEntity<VendorResponse> createVendor(
            @AuthenticationPrincipal String ownerId,
            @Valid @RequestBody CreateVendorRequest req) {
        return ResponseEntity.ok(foodService.createVendor(ownerId, req));
    }

    @GetMapping("/vendors/mine")
    public ResponseEntity<List<VendorResponse>> myVendors(
            @AuthenticationPrincipal String ownerId) {
        return ResponseEntity.ok(foodService.myVendors(ownerId));
    }

    // ── Admin: reviewing businesses ─────────────────────────────────────────────
    //
    // A business is reviewed separately from the person who owns it. Approving an account is a
    // check on somebody's identity; this is a check on a shop, and the two are not the same
    // decision — nor the same event, once an approved owner opens a second one.

    @GetMapping("/admin/vendors")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<List<VendorResponse>> listVendorsForAdmin(
            @RequestParam(required = false) String approval) {
        return ResponseEntity.ok(foodService.listVendorsForAdmin(approval));
    }

    @PatchMapping("/admin/vendors/{id}/approval")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<VendorResponse> reviewVendor(
            @PathVariable UUID id,
            @AuthenticationPrincipal String adminUserId,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(foodService.reviewVendor(
            id, adminUserId, body.getOrDefault("status", ""), body.get("note")));
    }

    /**
     * A vendor edits their own business, including the storefront customers read.
     *
     * Owner-guarded in the service: the id is in the path, but the authority comes from the token.
     */
    @PatchMapping("/vendors/{id}")
    public ResponseEntity<VendorResponse> updateVendor(
            @PathVariable UUID id,
            @AuthenticationPrincipal String ownerId,
            @RequestBody UpdateVendorRequest req) {
        return ResponseEntity.ok(foodService.updateVendor(id, ownerId, req));
    }

    // ── Orders ────────────────────────────────────────────────────────────────

    @PostMapping("/orders")
    public ResponseEntity<OrderResponse> placeOrder(
            @AuthenticationPrincipal String customerId,
            @Valid @RequestBody PlaceOrderRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(foodService.placeOrder(customerId, req));
    }

    /**
     * When a collecting customer should set off, given where they are now. Walk-in and pickup
     * both qualify — somebody has to travel to the counter either way; a delivery is refused.
     *
     * <p>Coordinates are query params, not stored on the order: what matters is where they are
     * when they ask, not where they were when they ordered. Both optional — without them the
     * caller still gets a ready time, just no travel leg.
     */
    @GetMapping("/orders/{id}/leave-time")
    public ResponseEntity<Map<String, Object>> leaveTime(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng) {
        return ResponseEntity.ok(foodService.collectionLeaveTime(id, userId, lat, lng));
    }

    @GetMapping("/orders/{id}")
    public ResponseEntity<OrderResponse> getOrder(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(foodService.getOrder(id, userId));
    }

    @GetMapping("/orders/mine")
    public ResponseEntity<List<OrderResponse>> myOrders(
            @AuthenticationPrincipal String customerId) {
        return ResponseEntity.ok(foodService.myOrders(customerId));
    }

    // ── Payment ───────────────────────────────────────────────────────────────

    @PostMapping("/orders/{id}/pay")
    public ResponseEntity<OrderResponse> payOrder(
            @PathVariable UUID id,
            @AuthenticationPrincipal String customerId,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(foodService.payOrder(
            id, customerId, body.getOrDefault("method", "wallet"), body.get("reference")));
    }

    @PostMapping("/orders/{id}/confirm-cash")
    public ResponseEntity<OrderResponse> confirmOrderCash(
            @PathVariable UUID id, @AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(foodService.confirmOrderCash(id, userId));
    }

    @GetMapping("/restaurants/{id}/awaiting-cash")
    public ResponseEntity<List<OrderResponse>> awaitingCash(
            @PathVariable UUID id, @AuthenticationPrincipal String ownerId) {
        return ResponseEntity.ok(foodService.awaitingCashOrders(ownerId, id));
    }

    // ── Platform fees (admin-controlled service + delivery fees) ─────────────────

    @GetMapping("/platform-fees")
    public ResponseEntity<PlatformFeesResponse> platformFees() {
        return ResponseEntity.ok(foodService.getPlatformFees());
    }

    @PatchMapping("/platform-fees")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<PlatformFeesResponse> updatePlatformFees(@RequestBody UpdatePlatformFeesRequest req) {
        return ResponseEntity.ok(foodService.updatePlatformFees(req));
    }

    // ── Restaurant dashboard ──────────────────────────────────────────────────

    @GetMapping("/restaurants/{id}/orders")
    public ResponseEntity<List<OrderResponse>> restaurantOrders(
            @PathVariable UUID id, @AuthenticationPrincipal String ownerId) {
        return ResponseEntity.ok(foodService.restaurantOrders(ownerId, id));
    }

    @PatchMapping("/orders/{id}/status")
    public ResponseEntity<OrderResponse> advanceStatus(
            @PathVariable UUID id,
            @AuthenticationPrincipal String ownerId,
            @Valid @RequestBody AdvanceStatusRequest req) {
        return ResponseEntity.ok(foodService.advanceStatus(id, ownerId, req));
    }

    // ── Delivery courier (drivers/couriers only) ────────────────────────────────

    @GetMapping("/deliveries/available")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER') and hasAuthority('STATUS_ACTIVE')")
    public ResponseEntity<List<DeliveryResponse>> availableDeliveries() {
        return ResponseEntity.ok(foodService.listAvailableDeliveries());
    }

    @GetMapping("/deliveries/mine")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER') and hasAuthority('STATUS_ACTIVE')")
    public ResponseEntity<List<DeliveryResponse>> myDeliveries(
            @AuthenticationPrincipal String courierId) {
        return ResponseEntity.ok(foodService.myDeliveries(courierId));
    }

    @PostMapping("/deliveries/{id}/accept")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER') and hasAuthority('STATUS_ACTIVE')")
    public ResponseEntity<DeliveryResponse> acceptDelivery(
            @PathVariable UUID id,
            @AuthenticationPrincipal String courierId) {
        return ResponseEntity.ok(foodService.acceptDelivery(id, courierId));
    }

    @PostMapping("/deliveries/location")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER') and hasAuthority('STATUS_ACTIVE')")
    public ResponseEntity<Void> pushCourierLocation(
            @AuthenticationPrincipal String courierId,
            @Valid @RequestBody CourierLocationUpdate dto) {
        foodService.updateDeliveryLocation(courierId, dto);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/deliveries/{id}/status")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER') and hasAuthority('STATUS_ACTIVE')")
    public ResponseEntity<Map<String, String>> advanceDeliveryStatus(
            @PathVariable UUID id,
            @AuthenticationPrincipal String courierId,
            @RequestBody Map<String, String> body) {
        foodService.advanceDeliveryStatus(id, courierId, body.getOrDefault("status", ""));
        return ResponseEntity.ok(Map.of("status", "updated"));
    }

    @PostMapping("/deliveries/{id}/confirm-cash")
    @PreAuthorize("hasAnyRole('DRIVER','COURIER') and hasAuthority('STATUS_ACTIVE')")
    public ResponseEntity<DeliveryResponse> confirmDeliveryCash(
            @PathVariable UUID id,
            @AuthenticationPrincipal String courierId) {
        return ResponseEntity.ok(foodService.confirmDeliveryCash(id, courierId));
    }

    // ── Queue ─────────────────────────────────────────────────────────────────

    @GetMapping("/restaurants/{id}/queue")
    public ResponseEntity<List<QueuePositionResponse>> getQueue(@PathVariable UUID id) {
        return ResponseEntity.ok(foodService.getQueue(id));
    }

    @GetMapping("/orders/{id}/queue-position")
    public ResponseEntity<QueuePositionResponse> myQueuePosition(@PathVariable UUID id) {
        return ResponseEntity.ok(foodService.myQueuePosition(id));
    }

    @PostMapping("/restaurants/{id}/queue/call-next")
    public ResponseEntity<QueuePositionResponse> callNext(
            @PathVariable UUID id, @AuthenticationPrincipal String ownerId) {
        return ResponseEntity.ok(foodService.callNext(ownerId, id));
    }

    @PostMapping("/queue/{entryId}/serve")
    public ResponseEntity<Map<String, String>> serveEntry(
            @PathVariable UUID entryId, @AuthenticationPrincipal String ownerId) {
        foodService.serveQueueEntry(ownerId, entryId);
        return ResponseEntity.ok(Map.of("status", "served"));
    }

    // ── Ratings ───────────────────────────────────────────────────────────────

    @PostMapping("/orders/{id}/rate")
    public ResponseEntity<Map<String, String>> rateOrder(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId,
            @Valid @RequestBody RateFoodRequest req) {
        foodService.rateOrder(id, userId, req);
        return ResponseEntity.ok(Map.of("status", "rated"));
    }

    // ── Health ping ───────────────────────────────────────────────────────────

    @GetMapping("/ping")
    public ResponseEntity<Map<String, String>> ping(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(Map.of("service", "food-service", "status", "ok"));
    }
}
