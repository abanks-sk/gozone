package com.gozone.auth.config;

import com.gozone.auth.service.JwtService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
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

    private final JwtService jwtService;

    public SecurityConfig(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf.disable())
            // Spring Security's LogoutFilter owns POST /logout by default and answers it with a
            // 302 redirect — which silently shadowed our own POST /auth/logout (the service
            // context-path makes the servlet path exactly /logout). We are stateless and revoke
            // refresh tokens ourselves, so the built-in handling is turned off.
            .logout(logout -> logout.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/register", "/login", "/register-email", "/login-email",
                    "/login-email-password",
                    "/verify-otp", "/refresh", "/admin/login", "/google",
                    "/actuator/**", "/error",
                    // JWKS — the other services fetch their verification key from here, and they
                    // have no token to present when they do. A public key is safe to publish.
                    "/.well-known/jwks.json",
                    // Internal service-to-service call, guarded by X-Internal-Key in the controller.
                    "/delivery-riders/availability"
                ).permitAll()
                // Reading an upload is decided by the upload, not by the URL: vendor shop imagery
                // is public, and a customer's <Image> on the web cannot attach a token. Letting the
                // request through is not letting it read anything — UploadController answers 401
                // for a private file with no caller, and UploadService still checks the owner.
                // GET only: creating an upload stays authenticated.
                .requestMatchers(HttpMethod.GET, "/uploads/**").permitAll()
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
            protected void doFilterInternal(HttpServletRequest request,
                                            HttpServletResponse response,
                                            FilterChain filterChain)
                    throws ServletException, IOException {

                String header = request.getHeader("Authorization");
                if (header != null && header.startsWith("Bearer ")) {
                    try {
                        String token = header.substring(7);
                        var claims = jwtService.validateAndParseClaims(token);
                        String userId = claims.getSubject();
                        String role   = claims.get("role", String.class);

                        var auth = new UsernamePasswordAuthenticationToken(
                            userId, null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + role))
                        );
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    } catch (Exception ignored) {
                        // Invalid token — let the request proceed unauthenticated;
                        // the authorizeHttpRequests rules will reject it if the path requires auth.
                    }
                }
                filterChain.doFilter(request, response);
            }
        };
    }
}
