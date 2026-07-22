package com.gozone.food.config;

import com.gozone.food.repository.DeliveryRepository;
import com.gozone.food.repository.OrderRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * WebSocket/STOMP for delivery courier tracking and walk-in queue position.
 *
 * Connection:  ws://host:8083/food/ws — STOMP CONNECT must carry a valid JWT in an
 *              `Authorization: Bearer <token>` (or `token`) native header, else rejected.
 *
 * SUBSCRIBE to /topic/delivery/{orderId}/location is further restricted to that order's
 * participants (customer, vendor owner, or assigned courier) so knowing an order UUID
 * isn't enough to watch the courier's live GPS. Admins may observe any delivery.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /** /topic/delivery/{uuid}/location — {uuid} is the ORDER id (see FoodService). */
    private static final Pattern DELIVERY_LOCATION =
        Pattern.compile("^/topic/delivery/([0-9a-fA-F-]{36})/location$");

    private final JwtProperties jwtProps;
    private final OrderRepository orderRepo;
    private final DeliveryRepository deliveryRepo;

    public WebSocketConfig(JwtProperties jwtProps,
                           OrderRepository orderRepo,
                           DeliveryRepository deliveryRepo) {
        this.jwtProps = jwtProps;
        this.orderRepo = orderRepo;
        this.deliveryRepo = deliveryRepo;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("*")
            .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic");
        config.setApplicationDestinationPrefixes("/app");
    }

    /** Authenticate CONNECT; authorise SUBSCRIBE to per-delivery location topics. */
    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (accessor == null) return message;

                if (StompCommand.CONNECT.equals(accessor.getCommand())) {
                    String token = bearer(accessor.getFirstNativeHeader("Authorization"));
                    if (token == null) token = accessor.getFirstNativeHeader("token");
                    if (token == null) throw new IllegalArgumentException("Missing auth token");
                    try {
                        SecretKey key = Keys.hmacShaKeyFor(jwtProps.getSecret().getBytes(StandardCharsets.UTF_8));
                        Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
                        var auth = new UsernamePasswordAuthenticationToken(
                            claims.getSubject(), null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + claims.get("role", String.class))));
                        accessor.setUser(auth);
                    } catch (Exception e) {
                        throw new IllegalArgumentException("Invalid auth token");
                    }
                } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
                    authorizeSubscribe(accessor);
                }
                return message;
            }
        });
    }

    /** Reject a SUBSCRIBE to a delivery-location topic unless the caller is on that order (or an admin). */
    private void authorizeSubscribe(StompHeaderAccessor accessor) {
        String dest = accessor.getDestination();
        if (dest == null) return;
        Matcher m = DELIVERY_LOCATION.matcher(dest);
        if (!m.matches()) {
            // Non-delivery topics (e.g. queue position counts) carry no per-user
            // data, but still require an authenticated socket.
            if (accessor.getUser() == null) throw new AccessDeniedException("Not authenticated");
            return;
        }

        Principal user = accessor.getUser();
        if (user == null) throw new AccessDeniedException("Not authenticated");
        if (isAdmin(user)) return;

        UUID uid;
        try {
            uid = UUID.fromString(user.getName());
        } catch (IllegalArgumentException e) {
            throw new AccessDeniedException("Not a participant of this delivery");
        }
        UUID orderId = UUID.fromString(m.group(1));

        boolean participant = orderRepo.isCustomerOrOwner(orderId, uid)
            || deliveryRepo.findByOrderId(orderId)
                .map(d -> uid.equals(d.getCourierId()))
                .orElse(false);

        if (!participant) {
            throw new AccessDeniedException("Not a participant of this delivery");
        }
    }

    private static boolean isAdmin(Principal user) {
        if (!(user instanceof Authentication auth)) return false;
        for (GrantedAuthority ga : auth.getAuthorities()) {
            String a = ga.getAuthority();
            if ("ROLE_ADMIN".equals(a) || "ROLE_SUPER_ADMIN".equals(a)) return true;
        }
        return false;
    }

    private static String bearer(String header) {
        return (header != null && header.startsWith("Bearer ")) ? header.substring(7) : null;
    }
}
