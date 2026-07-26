package com.gozone.ride.config;

import com.gozone.ride.model.TripPassenger;
import com.gozone.ride.repository.TripPassengerRepository;
import com.gozone.ride.repository.TripRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
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

import java.security.Principal;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Shared WebSocket/STOMP layer for live ride tracking and delivery courier tracking.
 *
 * Connection:  ws://host:8082/rides/ws  — STOMP CONNECT must carry a valid JWT in an
 *              `Authorization: Bearer <token>` (or `token`) native header, else the
 *              connection is rejected.
 *
 * SUBSCRIBE to /topic/trip/{tripId}/location is further restricted to that trip's
 * participants (the driver or a passenger) so knowing a trip UUID isn't enough to
 * watch its live GPS. Admins may observe any trip.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /** /topic/trip/{uuid}/location */
    private static final Pattern TRIP_LOCATION =
        Pattern.compile("^/topic/trip/([0-9a-fA-F-]{36})/location$");

    private final JwtProperties jwtProps;
    private final TripRepository tripRepo;
    private final TripPassengerRepository passengerRepo;

    public WebSocketConfig(JwtProperties jwtProps,
                           TripRepository tripRepo,
                           TripPassengerRepository passengerRepo) {
        this.jwtProps = jwtProps;
        this.tripRepo = tripRepo;
        this.passengerRepo = passengerRepo;
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

    /** Authenticate CONNECT; authorise SUBSCRIBE to per-trip location topics. */
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
                        Claims claims = Jwts.parser().verifyWith(jwtProps.verificationKey())
                            .requireIssuer(jwtProps.getIssuer())
                            .requireAudience(jwtProps.getAudience())
                            .build().parseSignedClaims(token).getPayload();
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

    /** Reject a SUBSCRIBE to a trip-location topic unless the caller is on that trip (or an admin). */
    private void authorizeSubscribe(StompHeaderAccessor accessor) {
        String dest = accessor.getDestination();
        if (dest == null) return;
        Matcher m = TRIP_LOCATION.matcher(dest);
        if (!m.matches()) return; // non-trip topics (e.g. queue) carry no per-user data

        Principal user = accessor.getUser();
        if (user == null) throw new AccessDeniedException("Not authenticated");
        if (isAdmin(user)) return;

        UUID uid;
        try {
            uid = UUID.fromString(user.getName());
        } catch (IllegalArgumentException e) {
            throw new AccessDeniedException("Not a participant of this trip");
        }
        UUID tripId = UUID.fromString(m.group(1));

        boolean participant = tripRepo.findById(tripId)
            .map(t -> t.getDriverId() != null && t.getDriverId().equals(uid))
            .orElse(false)
            || passengerRepo.existsById(new TripPassenger.TripPassengerId(tripId, uid));

        if (!participant) {
            throw new AccessDeniedException("Not a participant of this trip");
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
