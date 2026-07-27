package com.gozone.wallet.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtProperties jwtProps;
    private final JwkCache jwks;

    public SecurityConfig(JwtProperties jwtProps, JwkCache jwks) {
        this.jwtProps = jwtProps;
        this.jwks = jwks;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/**", "/error").permitAll()
                // Settlement + notify are internal service-to-service calls guarded by an
                // X-Internal-Key header in the controller, not a user JWT.
                .requestMatchers("/commission", "/settle/**", "/notify/**", "/pay/verify",
                                 "/charge", "/internal/**").permitAll()
                // Sandbox checkout page is opened in the device browser (no JWT); the
                // real crediting still requires an authenticated /topup/verify call.
                .requestMatchers("/mock-checkout").permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtFilter(), UsernamePasswordAuthenticationFilter.class)
            .build();
    }

    @Bean
    public OncePerRequestFilter jwtFilter() {
        return new OncePerRequestFilter() {
            // Also run on the internal ERROR dispatch so thrown exceptions render with their
            // real status + message instead of an empty 403 (the SecurityContext is per-request).
            @Override
            protected boolean shouldNotFilterErrorDispatch() { return false; }

            @Override
            protected void doFilterInternal(HttpServletRequest req,
                                            HttpServletResponse res,
                                            FilterChain chain)
                    throws ServletException, IOException {
                String header = req.getHeader("Authorization");
                if (header != null && header.startsWith("Bearer ")) {
                    try {
                        String token = header.substring(7);
                        Claims claims = Jwts.parser()
                            // Key chosen by the token's kid, from the set fetched from
                            // auth-service's JWKS - so a rotated key needs no redeploy here.
                            .keyLocator(h -> jwks.resolve(h.get("kid")))
                            .requireIssuer(jwtProps.getIssuer())
                            .requireAudience(jwtProps.getAudience())
                            .build()
                            .parseSignedClaims(token).getPayload();

                        String role = claims.get("role", String.class);
                        String status = claims.get("status", String.class);
                        if (status == null) status = "ACTIVE"; // legacy tokens
                        // STATUS_<status> mirrors ride/food, so money-moving endpoints
                        // (withdrawals) can require an approved account, not just a role.
                        var auth = new UsernamePasswordAuthenticationToken(
                            claims.getSubject(), null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + role),
                                    new SimpleGrantedAuthority("STATUS_" + status))
                        );
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    } catch (Exception ignored) {}
                }
                chain.doFilter(req, res);
            }
        };
    }
}
