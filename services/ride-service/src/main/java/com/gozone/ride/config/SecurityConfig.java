package com.gozone.ride.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
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

import javax.crypto.SecretKey;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtProperties jwtProps;

    public SecurityConfig(JwtProperties jwtProps) {
        this.jwtProps = jwtProps;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/**", "/error").permitAll()
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
                        SecretKey key = Keys.hmacShaKeyFor(
                            jwtProps.getSecret().getBytes(StandardCharsets.UTF_8));
                        Claims claims = Jwts.parser()
                            .verifyWith(key).build()
                            .parseSignedClaims(token).getPayload();

                        String role = claims.get("role", String.class);
                        String status = claims.get("status", String.class);
                        if (status == null) status = "ACTIVE"; // legacy tokens
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
